import { streamText, tool } from 'ai';
import { openai } from './openai.server';
import { tools } from '~/tools';
import { prisma } from './db.server';

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
function filterMessagesForLLM(messages: ChatMessage[]) {
  return messages.filter(msg =>
    msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'
  ).map(msg => ({
    role: msg.role as 'user' | 'assistant' | 'system',
    content: msg.content,
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
        const result = streamText({
          model: openai(model || 'gpt-4o-mini'),
          system: "You are a helpful assistant. When you use tools to gather information, you MUST always provide a comprehensive response based on the tool results. After calling a tool and receiving results, you MUST analyze and summarize the information for the user in a clear and helpful way. Never end your response with just a tool call - always follow up with explanatory text.",
          messages: filteredMessages,
          tools: tools.reduce((acc, t) => {
            acc[t.name] = tool({
              description: t.description,
              inputSchema: t.schema,
              execute: t.execute,
            });
            return acc;
          }, {} as any),
          toolChoice: 'auto',
        });

        // console.log('StreamText result created, starting to process fullStream');

        let hasToolCalls = false;
        const toolResults: Array<{ toolName: string; result: string; tool?: any }> = [];
        let assistantMessageContent = '';

        // Save user message if sessionId exists
        if (sessionId && filteredMessages.length > 0) {
          const lastMessage = filteredMessages[filteredMessages.length - 1];
          if (lastMessage.role === 'user') {
            await saveMessage(sessionId, lastMessage);
          }
        }

        for await (const part of result.fullStream) {
          // console.log('Processing stream part:', part.type);

          if (part.type === 'tool-call') {
            console.log('Tool call detected:', part.toolName, part.input);
            hasToolCalls = true;
            sendJSON({ type: 'tool_call', name: part.toolName, args: part.input });

            // Save tool call message
            if (sessionId) {
              await saveMessage(sessionId, {
                role: 'tool_call',
                content: `Calling ${part.toolName}`,
                toolName: part.toolName,
                toolArgs: part.input,
              });
            }
          } else if (part.type === 'tool-result') {
            // console.log('Tool result received:', part.toolName, 'Output:', part.output);
            // Find the tool instance for followup configuration
            const toolInstance = tools.find(t => t.name === part.toolName);
            // Store tool result for potential follow-up
            toolResults.push({
              toolName: part.toolName,
              result: String(part.output),
              tool: toolInstance
            });
            // Send tool result to frontend for debugging/transparency
            sendJSON({ type: 'tool_result', name: part.toolName, result: part.output });

            // Save tool result message
            if (sessionId) {
              await saveMessage(sessionId, {
                role: 'tool_result',
                content: `Tool result for ${part.toolName}`,
                toolName: part.toolName,
                toolResult: part.output,
              });
            }
          } else if (part.type === 'text-delta') {
            // console.log('Text delta received:', part.text);
            assistantMessageContent += part.text;
            sendJSON({ type: 'text_chunk', content: part.text });
          } else if (part.type === 'finish') {
            // console.log('Stream finished with reason:', part.finishReason);

            // If we had tool calls but no text was generated, force a follow-up
            // console.log('Checking follow-up conditions: hasToolCalls =', hasToolCalls, 'finishReason =', part.finishReason);
            if (hasToolCalls && part.finishReason === 'tool-calls') {
              // console.log('Tool calls finished without text, generating follow-up...');

              // Check if any tools have followup configuration
              const toolsWithFollowup = toolResults.filter(result =>
                result.tool?.followup?.enabled
              );

              if (toolsWithFollowup.length > 0) {
                // console.log('Found tools with followup configuration:', toolsWithFollowup.map(t => t.toolName));

                // Use the first tool's followup configuration (could be enhanced to merge multiple)
                const primaryTool = toolsWithFollowup[0];
                const followupConfig = primaryTool.tool.followup;

                // Create a follow-up request with tool-specific configuration
                // Include the tool results in the conversation history, with filtering if specified
                const followUpMessages = [
                  ...filteredMessages,
                  ...toolResults.map(result => {
                    const filteredResult = result.tool?.followup?.filterResult
                      ? result.tool.followup.filterResult(result.result)
                      : result.result;

                    return {
                      role: 'assistant' as const,
                      content: `Tool ${result.toolName} executed with result: ${filteredResult}`
                    };
                  })
                ];

                const followUpResult = streamText({
                  model: openai(model || 'gpt-4o-mini'),
                  system: followupConfig.systemPrompt || "You are a helpful assistant. Based on the tool results in the conversation, provide a comprehensive and helpful response to the user's question. Analyze and summarize the information clearly.",
                  messages: followUpMessages,
                });

                for await (const followUpPart of followUpResult.fullStream) {
                  if (followUpPart.type === 'text-delta') {
                    // console.log('Follow-up text delta:', followUpPart.text);
                    assistantMessageContent += followUpPart.text;
                    sendJSON({ type: 'text_chunk', content: followUpPart.text });
                  } else if (followUpPart.type === 'finish') {
                    // console.log('Follow-up finished');
                    break;
                  } else if (followUpPart.type === 'error') {
                    console.error('Follow-up error:', followUpPart.error);
                    break;
                  }
                }
              } else {
                // Fallback to default followup behavior
                console.log('No tools with followup configuration, using default behavior');

                const followUpMessages = [
                  ...filteredMessages,
                  ...toolResults.map(result => ({
                    role: 'assistant' as const,
                    content: `Tool ${result.toolName} executed with result: ${result.result}`
                  }))
                ];

                const followUpResult = streamText({
                  model: openai(model || 'gpt-4o-mini'),
                  system: "You are a helpful assistant. Based on the tool results in the conversation, provide a comprehensive and helpful response to the user's question. Analyze and summarize the information clearly.",
                  messages: followUpMessages,
                });

                for await (const followUpPart of followUpResult.fullStream) {
                  if (followUpPart.type === 'text-delta') {
                    // console.log('Follow-up text delta:', followUpPart.text);
                    assistantMessageContent += followUpPart.text;
                    sendJSON({ type: 'text_chunk', content: followUpPart.text });
                  } else if (followUpPart.type === 'finish') {
                    // console.log('Follow-up finished');
                    break;
                  } else if (followUpPart.type === 'error') {
                    console.error('Follow-up error:', followUpPart.error);
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
          } else if (part.type === 'error') {
            console.error('Stream error:', part.error);
            sendJSON({ type: 'error', message: String(part.error) });
            break;
          } else {
            console.log('Unknown stream part type:', part.type);
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
