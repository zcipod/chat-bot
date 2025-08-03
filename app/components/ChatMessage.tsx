import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { ChatMessage } from '~/hooks/useChatMessages';
import { ToolCallSection } from './ToolCallSection';

interface ChatMessageProps {
  message: ChatMessage;
  index: number;
  onToggleCollapse?: (index: number) => void;
}

export function ChatMessageComponent({ message }: ChatMessageProps) {

  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[70%] bg-blue-600 text-white rounded-lg px-4 py-2">
          <div className="text-sm font-medium mb-1">You</div>
          <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  if (message.role === 'assistant') {
    return (
      <div className="flex justify-start mb-4">
        <div className="max-w-[70%] space-y-3">
          {/* Tool calls section - displayed above the response */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <ToolCallSection toolCalls={message.toolCalls} />
          )}

          {/* Assistant response */}
          {message.content && (
            <div className="bg-gray-100 text-gray-900 rounded-lg px-4 py-2">
              <div className="text-sm font-medium mb-1 text-gray-700">Assistant</div>
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Tool call messages are now handled within assistant messages
  if (message.role === 'tool_call' || message.role === 'tool_result') {
    return null;
  }

  return null;
}
