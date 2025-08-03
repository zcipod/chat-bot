import { useState } from 'react';
import { ToolResultCard } from './ToolResultCard';

interface ToolCall {
  toolName: string;
  toolArgs?: any;
  toolResult?: any;
}

interface ToolCallSectionProps {
  toolCalls: ToolCall[];
}

export function ToolCallSection({ toolCalls }: ToolCallSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  const formatToolArgs = (args: any) => {
    if (!args) return '';
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  };

  const parseToolResult = (result: any) => {
    if (!result) return null;
    
    try {
      // If result is a string, try to parse it as JSON
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      
      // Check if it's a search result with results array
      if (parsed.results && Array.isArray(parsed.results)) {
        return parsed.results;
      }
      
      // If it's a single result object
      if (parsed.title || parsed.url) {
        return [parsed];
      }
      
      return null;
    } catch {
      return null;
    }
  };

  return (
    <div className="mb-4">
      {/* Collapsible header */}
      <div 
        className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 cursor-pointer hover:bg-blue-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-blue-800 font-medium">
              🔧 Tool Calls ({toolCalls.length})
            </div>
            <div className="text-xs text-blue-600">
              {toolCalls.map(tc => tc.toolName).join(', ')}
            </div>
          </div>
          <svg 
            className={`w-4 h-4 text-blue-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-2 space-y-4">
          {toolCalls.map((toolCall, index) => {
            const resultCards = parseToolResult(toolCall.toolResult);
            
            return (
              <div key={index} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="mb-3">
                  <h4 className="font-medium text-gray-900 mb-2">
                    {toolCall.toolName}
                  </h4>
                  
                  {/* Tool Arguments */}
                  {toolCall.toolArgs && (
                    <div className="mb-3">
                      <div className="text-xs font-medium text-gray-700 mb-1">Arguments:</div>
                      <pre className="text-xs bg-gray-100 p-2 rounded border overflow-x-auto">
                        {formatToolArgs(toolCall.toolArgs)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Tool Results as Cards */}
                {resultCards && resultCards.length > 0 ? (
                  <div className="space-y-3">
                    <div className="text-xs font-medium text-gray-700">Results:</div>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {resultCards.map((result: any, cardIndex: number) => (
                        <ToolResultCard key={cardIndex} result={result} />
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Fallback for non-card results */
                  toolCall.toolResult && (
                    <div>
                      <div className="text-xs font-medium text-gray-700 mb-1">Result:</div>
                      <pre className="text-xs bg-gray-100 p-2 rounded border overflow-x-auto max-h-40 overflow-y-auto">
                        {typeof toolCall.toolResult === 'string' 
                          ? toolCall.toolResult 
                          : JSON.stringify(toolCall.toolResult, null, 2)
                        }
                      </pre>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
