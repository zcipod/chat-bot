import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { ToolCallSection } from '~/components/ToolCallSection';
import { ToolResultCard } from '~/components/ToolResultCard';

export default function TestPage() {
  const markdownContent = `
# Markdown Test

This is a **bold** text and this is *italic* text.

## Code Block

\`\`\`javascript
function hello() {
  console.log("Hello, world!");
}
\`\`\`

## List

- Item 1
- Item 2
- Item 3

## Table

| Name | Age | City |
|------|-----|------|
| John | 25  | NYC  |
| Jane | 30  | LA   |

## Links

[Google](https://google.com)
`;

  const mockToolCalls = [
    {
      toolName: 'exa_search',
      toolArgs: { query: 'React hooks tutorial' },
      toolResult: {
        query: 'React hooks tutorial',
        results: [
          {
            title: 'React Hooks Tutorial - Complete Guide',
            url: 'https://example.com/react-hooks',
            text: 'Learn React Hooks with this comprehensive tutorial covering useState, useEffect, and custom hooks.',
            image: 'https://via.placeholder.com/300x200',
            author: 'John Doe',
            publishedDate: '2024-01-15'
          },
          {
            title: 'Advanced React Hooks Patterns',
            url: 'https://example.com/advanced-hooks',
            text: 'Explore advanced patterns and best practices for React Hooks in modern applications.',
            image: 'https://via.placeholder.com/300x200',
            author: 'Jane Smith',
            publishedDate: '2024-02-01'
          }
        ]
      }
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-gray-900">Test Page</h1>
        
        {/* Markdown Test */}
        <div className="bg-white rounded-lg p-6 shadow">
          <h2 className="text-xl font-semibold mb-4">Markdown Rendering Test</h2>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {markdownContent}
            </ReactMarkdown>
          </div>
        </div>

        {/* Tool Call Test */}
        <div className="bg-white rounded-lg p-6 shadow">
          <h2 className="text-xl font-semibold mb-4">Tool Call Section Test</h2>
          <ToolCallSection toolCalls={mockToolCalls} />
        </div>

        {/* Tool Result Card Test */}
        <div className="bg-white rounded-lg p-6 shadow">
          <h2 className="text-xl font-semibold mb-4">Tool Result Cards Test</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {mockToolCalls[0].toolResult.results.map((result: any, index: number) => (
              <ToolResultCard key={index} result={result} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
