import { useState } from 'react';

interface ToolResult {
  title?: string;
  url?: string;
  text?: string;
  image?: string;
  publishedDate?: string;
  author?: string;
}

interface ToolResultCardProps {
  result: ToolResult;
}

export function ToolResultCard({ result }: ToolResultCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleClick = () => {
    if (result.url) {
      try {
        window.open(result.url, '_blank', 'noopener,noreferrer');
      } catch (error) {
        console.error('Failed to open URL:', error);
      }
    }
  };

  return (
    <div
      className={`
        relative bg-white border border-gray-200 rounded-lg p-4 cursor-pointer
        transition-all duration-200 hover:shadow-md hover:border-gray-300
        ${result.url ? 'hover:bg-gray-50' : ''}
      `}
      onClick={handleClick}
      onMouseEnter={() => {
        setIsHovered(true);
        setShowTooltip(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowTooltip(false);
      }}
      onTouchStart={() => setShowTooltip(true)}
      onTouchEnd={() => setTimeout(() => setShowTooltip(false), 2000)}
    >
      {/* Image */}
      {result.image && (
        <div className="mb-3">
          <img
            src={result.image}
            alt={result.title || 'Tool result image'}
            className="w-full h-32 object-cover rounded-md"
            onError={(e) => {
              // Hide the entire image container if it fails to load
              const imgElement = e.target as HTMLImageElement;
              const container = imgElement.parentElement;
              if (container) {
                container.style.display = 'none';
              }
            }}
            onLoad={(e) => {
              // Ensure image is visible when it loads successfully
              const imgElement = e.target as HTMLImageElement;
              const container = imgElement.parentElement;
              if (container) {
                container.style.display = 'block';
              }
            }}
          />
        </div>
      )}

      {/* Title */}
      {result.title && (
        <h3 className="font-medium text-gray-900 mb-2 line-clamp-2">
          {result.title}
        </h3>
      )}

      {/* URL */}
      {result.url && (
        <p className="text-sm text-blue-600 mb-2 truncate">
          {result.url}
        </p>
      )}

      {/* Metadata */}
      {(result.author || result.publishedDate) && (
        <div className="text-xs text-gray-500 mb-2 flex gap-2">
          {result.author && <span>By {result.author}</span>}
          {result.author && result.publishedDate && <span>•</span>}
          {result.publishedDate && (
            <span>{new Date(result.publishedDate).toLocaleDateString()}</span>
          )}
        </div>
      )}

      {/* Hover/touch tooltip with summary */}
      {showTooltip && result.text && (
        <div className="absolute z-10 bottom-full left-0 right-0 mb-2 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-lg">
          <div className="max-h-32 overflow-y-auto">
            {result.text.length > 200 
              ? `${result.text.substring(0, 200)}...` 
              : result.text
            }
          </div>
          {/* Arrow pointing down */}
          <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
}
