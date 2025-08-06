import { useState, useCallback, useRef, useEffect } from 'react';

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string;
  toolName?: string;
  toolArgs?: any;
  toolResult?: any;
  isCollapsed?: boolean;
  createdAt?: string;
  toolCalls?: Array<{
    toolName: string;
    toolArgs?: any;
    toolResult?: any;
    messageId?: number; // Database ID for unique identification
    id?: string; // OpenAI tool call ID
    index?: number; // OpenAI tool call index
  }>;
}

export interface ToolStatus {
  name: string;
  args: any;
  completed?: boolean;
}

export interface UseChatMessagesProps {
  sessionId?: string;
  model?: string;
  onSessionCreated?: (sessionId: string) => void;
  onSessionUpdated?: () => void;
}

export function useChatMessages({ sessionId, model = 'gpt-4o-mini', onSessionCreated, onSessionUpdated }: UseChatMessagesProps = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<ToolStatus | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, toolStatus, scrollToBottom]);

  // Load messages for a session
  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages`);
      if (response.ok) {
        const data = await response.json();
        const allMessages = data.messages || [];

        // Group messages and attach tool calls to assistant messages
        const displayMessages: ChatMessage[] = [];
        let currentToolCalls: Array<{
          toolName: string; 
          toolArgs?: any; 
          toolResult?: any; 
          messageId?: number;
        }> = [];

        for (const msg of allMessages) {
          if (msg.role === 'tool_call') {
            // Each tool_call message now contains both args and result
            currentToolCalls.push({
              toolName: msg.toolName,
              toolArgs: msg.toolArgs,
              toolResult: msg.toolResult,
              messageId: msg.id,
            });
          } else if (msg.role === 'user' || msg.role === 'assistant') {
            // Add user message or assistant message with tool calls
            const messageToAdd: ChatMessage = { ...msg };
            if (msg.role === 'assistant' && currentToolCalls.length > 0) {
              messageToAdd.toolCalls = [...currentToolCalls];
              currentToolCalls = []; // Reset for next assistant message
            }
            displayMessages.push(messageToAdd);
          }
        }

        setMessages(displayMessages);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  }, []);

  // Create a new session
  const createNewSession = useCallback(async () => {
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' }),
      });
      if (response.ok) {
        const data = await response.json();
        const newSessionId = data.session.id;
        onSessionCreated?.(newSessionId);
        return newSessionId;
      }
    } catch (error) {
      console.error('Failed to create new session:', error);
    }
    return null;
  }, [onSessionCreated]);

  // Toggle tool call collapse state
  const toggleToolCollapse = useCallback((messageIndex: number) => {
    setMessages(prev => prev.map((msg, index) =>
      index === messageIndex ? { ...msg, isCollapsed: !msg.isCollapsed } : msg
    ));
  }, []);

  // Clear messages (for new session)
  const clearMessages = useCallback(() => {
    setMessages([]);
    setInput('');
    setIsLoading(false);
    setToolStatus(null);
  }, []);

  // Auto-generate title for session
  const generateSessionTitle = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/generate-title`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Generated title:', data.title);
        // Notify parent component to refresh sessions list
        onSessionUpdated?.();
      }
    } catch (error) {
      console.error('Failed to generate title:', error);
    }
  }, [onSessionUpdated]);

  // Send message
  const sendMessage = useCallback(async (messageText?: string) => {
    const textToSend = messageText || input.trim();
    if (!textToSend) return;

    let currentSessionId = sessionId;

    // Create new session if none exists
    if (!currentSessionId) {
      currentSessionId = await createNewSession();
      if (!currentSessionId) return;
      // The parent component will handle URL navigation via onSessionCreated
    }

    const newMessages = [...messages, { role: 'user' as const, content: textToSend }];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setToolStatus(null);

    let assistantMessage: ChatMessage = { role: 'assistant', content: '', toolCalls: [] };
    let messageIndex = newMessages.length;
    const currentToolCalls: Array<{
      toolName: string; 
      toolArgs?: any; 
      toolResult?: any; 
      messageId?: number;
      id?: string;
      index?: number;
    }> = [];

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          model,
          sessionId: currentSessionId
        }),
      });

      if (!response.body) {
        console.log('No response body');
        return;
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const lines = value.split('\n\n').filter(Boolean);
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.substring(5));

            if (data.type === 'tool_call') {
              setToolStatus({ name: data.name, args: data.args });

              // Add tool call to the collection with unique identifiers
              currentToolCalls.push({ 
                toolName: data.name, 
                toolArgs: data.args,
                messageId: data.messageId,
                id: data.id,
                index: data.index
              });

            } else if (data.type === 'tool_result') {
              setToolStatus({ name: data.name, args: data.args, completed: true });

              // Find the tool call by messageId (most reliable) or by OpenAI ID/index
              let pendingIndex = -1;
              if (data.messageId) {
                pendingIndex = currentToolCalls.findIndex(tc => tc.messageId === data.messageId);
              } else if (data.id) {
                pendingIndex = currentToolCalls.findIndex(tc => tc.id === data.id);
              } else if (data.index !== undefined) {
                pendingIndex = currentToolCalls.findIndex(tc => tc.index === data.index);
              } else {
                // Fallback: find first pending call with same name
                pendingIndex = currentToolCalls.findIndex(tc => 
                  tc.toolName === data.name && !tc.toolResult
                );
              }

              if (pendingIndex >= 0) {
                currentToolCalls[pendingIndex].toolResult = data.result;
              } else {
                // If no pending call found, add a new one (shouldn't normally happen)
                currentToolCalls.push({ 
                  toolName: data.name, 
                  toolResult: data.result,
                  messageId: data.messageId,
                  id: data.id,
                  index: data.index
                });
              }

            } else if (data.type === 'text_chunk') {
              if (toolStatus) setToolStatus(null);
              assistantMessage.content += data.content;
              assistantMessage.toolCalls = [...currentToolCalls];
              setMessages(prev => {
                const updatedMessages = [...prev];
                if (updatedMessages[messageIndex]?.role === 'assistant') {
                  updatedMessages[messageIndex] = assistantMessage;
                } else {
                  updatedMessages.push(assistantMessage);
                }
                return updatedMessages;
              });

            } else if (data.type === 'end') {
              setIsLoading(false);
              setToolStatus(null);

              // Auto-generate title if this is the first exchange in the session
              if (currentSessionId && newMessages.length === 1) {
                // Wait a bit for the assistant message to be saved, then generate title
                setTimeout(() => {
                  generateSessionTitle(currentSessionId);
                }, 1000);
              }

              return;

            } else if (data.type === 'error') {
              console.error('Error from server:', data.message);
              setIsLoading(false);
              setToolStatus({ name: 'Error', args: { message: data.message } });
              return;
            }
          }
        }
      }
    } catch (error) {
      console.error('Fetch error:', error);
      setIsLoading(false);
      setToolStatus({ name: 'Error', args: { message: 'Failed to connect to the server.' } });
    }
  }, [input, messages, model, sessionId, toolStatus, createNewSession, generateSessionTitle]);

  return {
    messages,
    input,
    setInput,
    isLoading,
    toolStatus,
    messagesEndRef,
    sendMessage,
    loadSession,
    createNewSession,
    toggleToolCollapse,
    clearMessages,
    generateSessionTitle,
  };
}
