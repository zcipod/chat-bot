import { openaiClient } from './openai.server';
import { tools, toolMap } from '~/tools';
import { prisma } from './db.server';
import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result';
  content: string;
  toolName?: string;
  toolArgs?: any;
  toolResult?: any;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  sessionId?: string;
}

interface ToolExecution {
  toolName: string;
  toolArgs: any;
  result: string;
  tool: any;
  messageId?: number; // Database ID for the tool call message
}

// Get max tool call rounds from environment variable, default to 3
const MAX_TOOL_CALL_ROUNDS = parseInt(process.env.MAX_TOOL_CALL_ROUNDS || '3');

// Filter messages for LLM (remove tool_call and tool_result messages)
function filterMessagesForLLM(messages: ChatMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return messages.filter(msg =>
    msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'
  ).map(msg => ({
    role: msg.role as 'user' | 'assistant' | 'system',
    content: msg.content,
  }));
}

// Convert tools to OpenAI format
function convertToolsToOpenAIFormat() {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.schema),
    },
  }));
}

// Execute tool concurrently and handle all related operations
async function executeToolConcurrently(
  toolCall: any,
  sessionId: string | undefined,
  sendJSON: (data: object) => void
): Promise<ToolExecution | null> {
  if (!toolCall.function?.name || !toolCall.function?.arguments) {
    console.error('Invalid tool call structure:', toolCall);
    return null;
  }

  try {
    const toolName = toolCall.function.name;
    let toolArgs: any;
    
    try {
      toolArgs = JSON.parse(toolCall.function.arguments);
    } catch (parseError) {
      console.error('Failed to parse tool arguments:', toolCall.function.arguments, parseError);
      sendJSON({ type: 'error', message: `Invalid tool arguments: ${parseError}` });
      return null;
    }

    console.log('Tool call detected:', toolName, toolArgs);
    
    // Insert tool call message into database immediately and get ID
    let savedMessageId: number | undefined = undefined;
    if (sessionId) {
      const savedMessage = await prisma.message.create({
        data: {
          sessionId,
          role: 'tool_call',
          content: `Calling ${toolName}`,
          toolName: toolName,
          toolArgs: JSON.stringify(toolArgs),
          toolResult: null, // Will be updated later
          isCollapsed: true,
        },
      });
      savedMessageId = savedMessage.id;
      console.log(`Created tool call message with ID: ${savedMessageId}`);
    }
    
    sendJSON({ 
      type: 'tool_call', 
      name: toolName, 
      args: toolArgs,
      id: toolCall.id,
      index: toolCall.index,
      messageId: savedMessageId
    });

    // Debug: Log available tools
    console.log('Available tools:', Array.from(toolMap.keys()));
    
    // Find and execute the tool
    const toolInstance = toolMap.get(toolName);
    if (!toolInstance) {
      const errorMessage = `Tool ${toolName} not found. Available tools: ${Array.from(toolMap.keys()).join(', ')}`;
      console.error(errorMessage);
      sendJSON({ type: 'error', message: errorMessage });
      return null;
    }

    console.log(`Executing tool: ${toolName}`);
    const result = await toolInstance.execute(toolArgs);
    console.log(`Tool ${toolName} completed successfully`);

    // Update the existing message with the result
    if (sessionId && savedMessageId) {
      await prisma.message.update({
        where: { id: savedMessageId },
        data: {
          content: `Tool ${toolName} executed`,
          toolResult: JSON.stringify(result),
        },
      });
      console.log(`Updated tool call message ID: ${savedMessageId} with result`);
    }

    // Send tool result to frontend
    sendJSON({ 
      type: 'tool_result', 
      name: toolName, 
      result: result,
      id: toolCall.id,
      index: toolCall.index,
      messageId: savedMessageId
    });

    return {
      toolName,
      toolArgs,
      result,
      tool: toolInstance,
      messageId: savedMessageId // Add message ID for frontend reference
    };
  } catch (error) {
    console.error('Tool execution error:', error);
    const errorMessage = `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`;
    sendJSON({ type: 'error', message: errorMessage });
    return null;
  }
}

// Generate followup messages from tool executions
function generateFollowupMessages(
  toolExecutions: ToolExecution[],
  filteredMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const followupMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  
  // Group tools by their followup configuration
  const toolsWithFollowup = toolExecutions.filter(execution => 
    execution.tool?.followup?.enabled
  );

  if (toolsWithFollowup.length > 0) {
    // Create system message combining all followup prompts
    const systemPrompts = toolsWithFollowup
      .map(execution => execution.tool.followup.systemPrompt)
      .filter(prompt => prompt)
      .join('\n\n');
    
    const combinedSystemPrompt = systemPrompts || 
      "You are a helpful assistant. Based on the tool results in the conversation, provide a comprehensive and helpful response to the user's question. Analyze and summarize the information clearly.";

    followupMessages.push({
      role: 'system',
      content: combinedSystemPrompt
    });

    // Add original conversation
    followupMessages.push(...filteredMessages);

    // Add tool results, each processed by its own filter
    toolExecutions.forEach(execution => {
      const filteredResult = execution.tool?.followup?.filterResult
        ? execution.tool.followup.filterResult(execution.result)
        : execution.result;

      followupMessages.push({
        role: 'assistant',
        content: `Tool ${execution.toolName} executed with result: ${filteredResult}\n\n`
      });
    });
  } else {
    // Default followup behavior when no specific followup config
    followupMessages.push({
      role: 'system',
      content: "You are a helpful assistant. Based on the tool results in the conversation, provide a comprehensive and helpful response to the user's question. Analyze and summarize the information clearly."
    });

    followupMessages.push(...filteredMessages);

    toolExecutions.forEach(execution => {
      followupMessages.push({
        role: 'assistant',
        content: `Tool ${execution.toolName} executed with result: ${execution.result}`
      });
    });
  }

  return followupMessages;
}

// Create LLM completion request parameters
function createChatParams(
  model: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  includeTools: boolean,
  currentRound: number
): OpenAI.Chat.Completions.ChatCompletionCreateParams {
  const openaiTools = includeTools ? convertToolsToOpenAIFormat() : [];
  
  // Enhanced system message that encourages concurrent tool usage
  let systemContent = "You are a helpful assistant. When you use tools to gather information, you MUST always provide a comprehensive response based on the tool results. After calling tools and receiving results, you MUST analyze and summarize the information for the user in a clear and helpful way. Never end your response with just a tool call - always follow up with explanatory text.";
  
  if (includeTools && openaiTools.length > 0) {
    systemContent += "\n\nIMPORTANT: You can call multiple tools simultaneously in a single response when needed. For example, you can perform multiple searches at once to gather comprehensive information from different sources or search for different aspects of a topic. Don't hesitate to use multiple tools when it would provide better, more complete answers.";
    
    if (currentRound >= MAX_TOOL_CALL_ROUNDS) {
      systemContent += `\n\nIMPORTANT: This is your final opportunity to call tools (round ${currentRound}/${MAX_TOOL_CALL_ROUNDS}). Please make all necessary tool calls now, as you won't have another chance after this response.`;
    } else {
      systemContent += `\n\nNote: You have ${MAX_TOOL_CALL_ROUNDS - currentRound} more rounds of tool calls available if needed.`;
    }
  }

  const systemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
    role: 'system',
    content: systemContent
  };

  // Filter out any existing system messages and add our enhanced one
  const messagesWithoutSystem = messages.filter(msg => msg.role !== 'system');
  const allMessages = [systemMessage, ...messagesWithoutSystem];

  return {
    model: model || 'gpt-4o-mini',
    messages: allMessages,
    stream: true,
    tools: includeTools && openaiTools.length > 0 ? openaiTools : undefined,
    tool_choice: includeTools && openaiTools.length > 0 ? 'auto' : undefined,
  };
}

// Save message to database
async function saveMessage(sessionId: string, message: Partial<ChatMessage>) {
  try {
    await prisma.message.create({
      data: {
        sessionId,
        role: message.role!,
        content: message.content!,
        toolName: message.toolName,
        toolArgs: message.toolArgs ? JSON.stringify(message.toolArgs) : null,
        toolResult: message.toolResult ? JSON.stringify(message.toolResult) : null,
        isCollapsed: message.role === 'tool_call' ? true : false,
      },
    });
  } catch (error) {
    console.error('Failed to save message:', error);
  }
}

export async function createChatStream(request: ChatRequest): Promise<ReadableStream> {
  const { messages, model, sessionId } = request;
  console.log('Received messages:', messages, 'Model:', model, 'SessionId:', sessionId);

  // Filter messages for LLM (only user, assistant, system)
  let currentMessages = filterMessagesForLLM(messages);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const sendJSON = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Save user message if sessionId exists
        if (sessionId && currentMessages.length > 0) {
          const lastMessage = currentMessages[currentMessages.length - 1];
          if (lastMessage.role === 'user') {
            await saveMessage(sessionId, {
              role: lastMessage.role,
              content: typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content)
            });
          }
        }

        let currentRound = 1;
        let allAssistantContent = '';

        // Main conversation loop with multi-round tool support
        while (currentRound <= MAX_TOOL_CALL_ROUNDS) {
          const includeTools = currentRound <= MAX_TOOL_CALL_ROUNDS;
          const chatParams = createChatParams(model || 'gpt-4o-mini', currentMessages, includeTools, currentRound);
          
          const result = await openaiClient.chat.completions.create(chatParams);

          let hasToolCalls = false;
          const toolCalls: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[] = [];
          let roundAssistantContent = '';

          // Process streaming response
          for await (const chunk of result as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
            const choice = chunk.choices[0];
            if (!choice) continue;

            const delta = choice.delta;

            // Handle tool calls
            if (delta.tool_calls) {
              hasToolCalls = true;
              for (const toolCall of delta.tool_calls) {
                const index = toolCall.index;

                // Initialize tool call if not exists
                if (!toolCalls[index]) {
                  toolCalls[index] = {
                    index: index,
                    id: toolCall.id || '',
                    type: 'function',
                    function: { name: '', arguments: '' }
                  };
                }

                // Update tool call data
                if (toolCall.function?.name) {
                  toolCalls[index].function!.name += toolCall.function.name;
                }
                if (toolCall.function?.arguments) {
                  toolCalls[index].function!.arguments += toolCall.function.arguments;
                }
              }
            }

            // Handle text content
            if (delta.content) {
              roundAssistantContent += delta.content;
              allAssistantContent += delta.content;
              sendJSON({ type: 'text_chunk', content: delta.content });
            }

            // Handle finish reason
            if (choice.finish_reason) {
              if (hasToolCalls && choice.finish_reason === 'tool_calls') {
                console.log(`Finish reason: tool_calls, found ${toolCalls.length} tool calls`);
                
                // Log all tool calls before execution
                toolCalls.forEach((toolCall, index) => {
                  console.log(`Tool call ${index}:`, {
                    name: toolCall.function?.name,
                    arguments: toolCall.function?.arguments,
                    hasName: !!toolCall.function?.name,
                    hasArgs: !!toolCall.function?.arguments
                  });
                });
                
                // Execute all tool calls concurrently
                const validToolCalls = toolCalls.filter(toolCall => 
                  toolCall.function?.name && toolCall.function?.arguments
                );
                
                console.log(`Valid tool calls: ${validToolCalls.length} of ${toolCalls.length}`);
                
                const toolExecutionPromises = validToolCalls.map(toolCall => 
                  executeToolConcurrently(toolCall, sessionId, sendJSON)
                );

                let toolExecutions: ToolExecution[] = [];
                try {
                  const results = await Promise.all(toolExecutionPromises);
                  toolExecutions = results.filter((execution): execution is ToolExecution => execution !== null);
                } catch (error) {
                  console.error('Error in concurrent tool execution:', error);
                  sendJSON({ type: 'error', message: `Concurrent tool execution failed: ${error}` });
                }

                console.log(`Successful tool executions: ${toolExecutions.length}`);

                if (toolExecutions.length > 0) {
                  // Generate followup messages for next round
                  const followupMessages = generateFollowupMessages(toolExecutions, currentMessages);
                  currentMessages = followupMessages;
                  currentRound++;
                  
                  // Continue to next round for followup processing
                  break;
                } else {
                  // No successful tool executions, end here
                  if (sessionId && allAssistantContent.trim()) {
                    await saveMessage(sessionId, {
                      role: 'assistant',
                      content: allAssistantContent.trim(),
                    });
                  }
                  sendJSON({ type: 'end' });
                  controller.close();
                  return;
                }
              } else {
                // No tool calls or different finish reason, conversation is complete
                if (sessionId && allAssistantContent.trim()) {
                  await saveMessage(sessionId, {
                    role: 'assistant',
                    content: allAssistantContent.trim(),
                  });
                }
                sendJSON({ type: 'end' });
                controller.close();
                return;
              }
            }
          }

          // If we reach here without tool calls, end the conversation
          if (!hasToolCalls) {
            if (sessionId && allAssistantContent.trim()) {
              await saveMessage(sessionId, {
                role: 'assistant',
                content: allAssistantContent.trim(),
              });
            }
            break;
          }
        }

        // End conversation after max rounds
        sendJSON({ type: 'end' });
        controller.close();

      } catch (e) {
        console.error('Chat stream error:', e);
        const errorPayload = { type: 'error', message: (e as Error).message };
        sendJSON(errorPayload);
        sendJSON({ type: 'end' });
        controller.close();
      }
    },
  });

  return stream;
}
