import { openaiClient } from './openai.server';
import { tools } from '~/tools';
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
  const filteredMessages = filterMessagesForLLM(messages);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const sendJSON = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Prepare OpenAI chat completion request
        const openaiTools = convertToolsToOpenAIFormat();
        const systemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
          role: 'system',
          content: "You are a helpful assistant. When you use tools to gather information, you MUST always provide a comprehensive response based on the tool results. After calling a tool and receiving results, you MUST analyze and summarize the information for the user in a clear and helpful way. Never end your response with just a tool call - always follow up with explanatory text."
        };

        const allMessages = [systemMessage, ...filteredMessages];

        const chatParams: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
          model: model || 'gpt-4o-mini',
          messages: allMessages,
          stream: true,
          tools: openaiTools.length > 0 ? openaiTools : undefined,
          tool_choice: openaiTools.length > 0 ? 'auto' : undefined,
        };

        const result = await openaiClient.chat.completions.create(chatParams);

        let hasToolCalls = false;
        const toolCalls: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[] = [];
        const toolResults: Array<{ toolName: string; result: string; tool?: any }> = [];
        let assistantMessageContent = '';

        // Save user message if sessionId exists
        if (sessionId && filteredMessages.length > 0) {
          const lastMessage = filteredMessages[filteredMessages.length - 1];
          if (lastMessage.role === 'user') {
            await saveMessage(sessionId, {
              role: lastMessage.role,
              content: typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content)
            });
          }
        }

        for await (const chunk of result) {
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
            assistantMessageContent += delta.content;
            sendJSON({ type: 'text_chunk', content: delta.content });
          }

          // Handle finish reason
          if (choice.finish_reason) {
            // Execute tool calls if any
            if (hasToolCalls && choice.finish_reason === 'tool_calls') {
              // Execute all tool calls
              for (const toolCall of toolCalls) {
                if (toolCall.function?.name && toolCall.function?.arguments) {
                  try {
                    const toolName = toolCall.function.name;
                    const toolArgs = JSON.parse(toolCall.function.arguments);

                    console.log('Tool call detected:', toolName, toolArgs);
                    sendJSON({ type: 'tool_call', name: toolName, args: toolArgs });

                    // Save tool call message
                    if (sessionId) {
                      await saveMessage(sessionId, {
                        role: 'tool_call',
                        content: `Calling ${toolName}`,
                        toolName: toolName,
                        toolArgs: toolArgs,
                      });
                    }

                    // Find and execute the tool
                    const toolInstance = tools.find(t => t.name === toolName);
                    if (toolInstance) {
                      const result = await toolInstance.execute(toolArgs);

                      // Store tool result for potential follow-up
                      toolResults.push({
                        toolName: toolName,
                        result: result,
                        tool: toolInstance
                      });

                      // Send tool result to frontend
                      sendJSON({ type: 'tool_result', name: toolName, result: result });

                      // Save tool result message
                      if (sessionId) {
                        await saveMessage(sessionId, {
                          role: 'tool_result',
                          content: `Tool result for ${toolName}`,
                          toolName: toolName,
                          toolResult: result,
                        });
                      }
                    }
                  } catch (error) {
                    console.error('Tool execution error:', error);
                    sendJSON({ type: 'error', message: `Tool execution failed: ${error}` });
                  }
                }
              }
              // Generate follow-up response with tool results
              // Check if any tools have followup configuration
              const toolsWithFollowup = toolResults.filter(result =>
                result.tool?.followup?.enabled
              );

              if (toolsWithFollowup.length > 0) {
                // Use the first tool's followup configuration
                const primaryTool = toolsWithFollowup[0];
                const followupConfig = primaryTool.tool.followup;

                // Create follow-up messages with tool results
                const toolResultMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = toolResults.map(result => {
                  const filteredResult = result.tool?.followup?.filterResult
                    ? result.tool.followup.filterResult(result.result)
                    : result.result;

                  return {
                    role: 'assistant' as const,
                    content: `Tool ${result.toolName} executed with result: ${filteredResult}`
                  };
                });

                const followUpMessages = [
                  {
                    role: 'system' as const,
                    content: followupConfig.systemPrompt || "You are a helpful assistant. Based on the tool results in the conversation, provide a comprehensive and helpful response to the user's question. Analyze and summarize the information clearly."
                  },
                  ...filteredMessages,
                  ...toolResultMessages
                ];

                const followUpResult = await openaiClient.chat.completions.create({
                  model: model || 'gpt-4o-mini',
                  messages: followUpMessages,
                  stream: true,
                });

                for await (const followUpChunk of followUpResult) {
                  const followUpChoice = followUpChunk.choices[0];
                  if (!followUpChoice) continue;

                  if (followUpChoice.delta.content) {
                    assistantMessageContent += followUpChoice.delta.content;
                    sendJSON({ type: 'text_chunk', content: followUpChoice.delta.content });
                  }

                  if (followUpChoice.finish_reason) {
                    break;
                  }
                }
              } else {
                // Fallback to default followup behavior
                console.log('No tools with followup configuration, using default behavior');

                const defaultFollowUpMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                  {
                    role: 'system',
                    content: "You are a helpful assistant. Based on the tool results in the conversation, provide a comprehensive and helpful response to the user's question. Analyze and summarize the information clearly."
                  },
                  ...filteredMessages,
                  ...toolResults.map(result => ({
                    role: 'assistant' as const,
                    content: `Tool ${result.toolName} executed with result: ${result.result}`
                  }))
                ];

                const followUpResult = await openaiClient.chat.completions.create({
                  model: model || 'gpt-4o-mini',
                  messages: defaultFollowUpMessages,
                  stream: true,
                });

                for await (const followUpChunk of followUpResult) {
                  const followUpChoice = followUpChunk.choices[0];
                  if (!followUpChoice) continue;

                  if (followUpChoice.delta.content) {
                    assistantMessageContent += followUpChoice.delta.content;
                    sendJSON({ type: 'text_chunk', content: followUpChoice.delta.content });
                  }

                  if (followUpChoice.finish_reason) {
                    break;
                  }
                }
              }
            }

            // Save assistant message
            if (sessionId && assistantMessageContent.trim()) {
              await saveMessage(sessionId, {
                role: 'assistant',
                content: assistantMessageContent.trim(),
              });
            }
            break;
          }
        }
      } catch (e) {
        console.error('Chat stream error:', e);
        const errorPayload = { type: 'error', message: (e as Error).message };
        sendJSON(errorPayload);
      } finally {
        sendJSON({ type: 'end' });
        controller.close();
      }
    },
  });

  return stream;
}
