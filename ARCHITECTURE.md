### **Chatbot Architecture Design Document (V3 - Final)**

#### **1. System Overview**

This document outlines the design of an intelligent chatbot based on the Remix framework. The system integrates the OpenAI API for language model inference and the Exa API for online search, using a SQLite database for persistent storage of conversation history. The system is flexibly configured via environment variables, and the frontend provides model selection functionality, eliminating the need for a complex backend user system.

#### **2. Core Technology Stack**

*   **Full-stack Framework**: Remix
*   **Frontend**: React
*   **Backend Runtime**: Node.js
*   **Large Language Model**: OpenAI SDK (leveraging **Tool Calling** and **Streaming Responses**)
*   **Search Engine**: Exa API (as an LLM **Tool**)
*   **Database**: SQLite
*   **ORM**: Prisma
*   **Validation**: Zod

#### **3. System Architecture (Final)**

This version introduces two key improvements: **Pluggable Tool Architecture** and **Structured State Streaming to the Frontend**.

**Final Architecture Diagram:**

```
+------------------+      (Structured JSON Stream)      +----------------------+
|                  |  <------------------------------->   |                      |
|   User Browser   |   1. Send Msg / 5. Receive Status   |     Remix Backend    |
| (React Frontend) |      & Final Streamed Response      | (Node.js / Server)   |
|                  |                                    |                      |
+------------------+                                    +----------------------+
                                                               |         ^
                                                               |         |
+--------------------------------------------------------------v---------+-------------------------+
| Agent Loop (executed in Remix Backend)                                                          |
|                                                                                                 |
|   +-------------------------+   2. Request Reply (with Tool Definition)   +-----------------+   6. Send Tool Result   +-----------------+
|   |                         | ------------------------------------------> |                 | ----------------------> |                 |
|   |      Orchestrator       |                                             |   OpenAI API    |                         |   OpenAI API    |
|   | (app/routes/_index.tsx) |   3. Return Tool Call Request             | (Tool Calling)  |   7. Return Final Reply (Stream) | (Summarization) |
|   |                         | <------------------------------------------ |                 | <---------------------- |                 |
|   +-------------------------+                                             +-----------------+                         +-----------------+
|              |         |
|              |         | 4. Send Tool Call Status to Frontend
|              |         v
|              |      (Frontend)
|              |
|              | 4. Find and Execute Tool
|              v
|   +-------------------------+
|   |                         |
|   | Tool Executor (toolMap) |
|   |                         |
|   +-------------------------+
|                                                                                                 |
+-------------------------------------------------------------------------------------------------+
```

#### **4. Key Implementation Details**

##### **4.1. Pluggable Tool Architecture**

To facilitate future expansion, we will define a unified tool interface. All tools (e.g., Exa search, calculator, database queries) will implement this interface.

*   **Directory**: `app/tools/`
*   **Base Interface (`app/tools/base.ts`)**:
    ```typescript
    import { z } from 'zod';

    // Defines the structure all tools must adhere to
    export interface Tool {
      // Tool name, used for LLM identification
      name: string;
      // Natural language description of the tool's function, for LLM to understand when to use it
      description: string;
      // Zod Schema defining the tool's input parameters, for validation and type hinting
      schema: z.ZodObject<any, any, any>;
      // Core logic to execute the tool
      execute(args: z.infer<this['schema']>): Promise<string>;
      // Optional followup configuration for the tool
      followup?: FollowupConfig;
    }
    ```
*   **Followup Configuration (`app/tools/base.ts`)**:
    ```typescript
    export interface FollowupConfig {
      // Whether a followup request is enabled
      enabled: boolean;
      // System prompt for the followup request
      systemPrompt?: string;
      // Function to filter tool results, to remove unnecessary information for the followup request
      filterResult?: (result: string) => string;
    }
    ```
*   **Tool Implementation (`app/tools/exa_search.ts`)**:
    ```typescript
    import { Tool, FollowupConfig } from './base';
    import { z } from 'zod';
    import { search } from '../services/exa.server'; // Assumed Exa service

    export class ExaSearchTool implements Tool {
      name = 'exa_search';
      description = 'Use this tool to search for information when answering questions about recent events or when information from the web is needed.';
      schema = z.object({
        query: z.string().describe('The search query to find information for.'),
      });

      // Followup configuration: requires LLM to cite sources and filters unnecessary fields
      followup: FollowupConfig = {
        enabled: true,
        systemPrompt: "Based on the search results provided, please provide a comprehensive response to the user's question. You MUST cite your sources by including the URLs and titles of the articles you reference. When mentioning information from the search results, always include the source URL in your response.",
        filterResult: (result: string) => {
          try {
            const parsed = JSON.parse(result);
            const filtered = {
              query: parsed.query,
              results: parsed.results?.map((result: any) => ({
                title: result.title,
                url: result.url,
                text: result.text
              })) || []
            };
            return JSON.stringify(filtered, null, 2);
          } catch (error) {
            return result;
          }
        }
      };

      async execute({ query }: z.infer<typeof this.schema>): Promise<string> {
        const searchResults = await search(query);
        const formattedResults = {
          query: query,
          searchType: (searchResults as any).resolvedSearchType,
          results: (searchResults as any).results?.map((result: any) => ({
            title: result.title,
            url: result.url,
            publishedDate: result.publishedDate,
            author: result.author,
            text: result.text,
            image: result.image
          })) || []
        };
        return JSON.stringify(formattedResults, null, 2);
      }
    }
    ```
*   **Tool Registry (`app/tools/index.ts`)**:
    ```typescript
    import { ExaSearchTool } from './exa_search';
    import type { Tool } from './base';

    // Export an array of all available tools
    export const tools: Tool[] = [new ExaSearchTool()];

    // Create a Map for quick tool lookup by name in the Agent
    export const toolMap = new Map(tools.map(tool => [tool.name, tool]));
    ```
*   **Agent Integration**: The Agent orchestrator will import the `tools` array, format it, and provide it to OpenAI. When a tool call request is received, it will use `toolMap` to find and execute the correct tool.

##### **4.2. Frontend State Updates and Streaming (Structured Streaming)**

We will no longer send plain text streams directly to the frontend, but instead send **streams of structured JSON objects**, each describing its content type.

*   **Data Stream Format**:
    ```json
    // When a tool is called
    { "type": "tool_call", "name": "exa_search", "args": { "query": "AI news" } }

    // When a text chunk of the final reply arrives
    { "type": "text_chunk", "content": "Based on the latest search results..." }

    // When all content ends
    { "type": "end" }
    ```
*   **Backend Implementation (`action` function)**:
    *   Use `new Response(new ReadableStream(...))` combined with `TransformStream` to construct the response.
    *   Each step of the Agent's logic will write a JSON string in the above format to the stream:
        1.  When the LLM decides to call a tool, write `{ "type": "tool_call", ... }`.
        2.  After executing the tool, send the result back to the LLM.
        3.  When the LLM starts generating the final reply, wrap each `chunk` of its response stream into `{ "type": "text_chunk", ... }` and write it.
*   **Frontend Implementation (`_index.tsx`)**:
    *   Use a custom Hook (`useChatStream`) to handle the stream returned by `fetcher.data`.
    *   This Hook will read the stream line by line and `JSON.parse()` each line.
    *   Update React state based on the `type` field:
        *   `tool_call`: Set a `toolStatus` state, e.g., `{ name: 'exa_search' }`. The UI will render "Searching with Exa..." or similar.
        *   `text_chunk`: **First clear the `toolStatus` state**, then append the `content` to the main displayed message. The UI will hide the tool status and start streaming the final answer.
        *   `end`: Mark the stream as ended, allowing for final operations like enabling the input box.

#### **5. Final Data Flow (Refined)**

1.  User types "What's the latest AI news?" in the browser and clicks send.
2.  Frontend POSTs `{ message: "..." }` to `action`.
3.  Backend Agent starts, sends user message history and `tools` definition to OpenAI, requesting a streaming response.
4.  OpenAI returns a tool call request `tool_calls: [{ name: 'exa_search', args: { query: 'AI news' } }]`.
5.  Backend writes to the client's response stream: `{"type": "tool_call", "name": "exa_search", ...}`.
6.  **Frontend**: Receives `tool_call`, updates UI to show "Searching with Exa..." or similar.
7.  Backend uses `toolMap` to find `ExaSearchTool` and executes `execute({ query: 'AI news' })`.
8.  Backend sends Exa's search results as a new message, and calls OpenAI again, requesting a streaming response.
9.  OpenAI starts streaming the summarized text.
10. Backend wraps each received text chunk and writes it to the stream: `{"type": "text_chunk", "content": "Based on..."}`, `{"type": "text_chunk", "content": "the latest..."}`...
11. **Frontend**: Receives the first `text_chunk`, **hides "Searching with Exa..."**, and starts rendering the `content` to the screen. Subsequent `text_chunk`s will continuously append content.
12. After the stream ends, the backend saves the complete conversation (user question, tool call, tool result, final answer) to SQLite.

#### **6. Final Directory Structure**

```
/
├── app/
│   ├── components/
│   │   └── ...
│   ├── routes/
│   │   └── _index.tsx           # UI, Agent Action, Streaming Logic
│   ├── services/
│   │   ├── openai.server.ts
│   │   ├── exa.server.ts
│   │   └── db.server.ts
│   ├── tools/                   # <--- New: Pluggable Tools
│   │   ├── base.ts              # Tool Interface
│   │   ├── exa_search.ts        # Exa Tool Implementation
│   │   └── index.ts             # Tool Registry
│   └── root.tsx
├── prisma/
│   ├── schema.prisma
│   └── dev.db
├── .env
├── package.json
├── Dockerfile                   # <--- New: Dockerfile for containerization
├── docker-compose.yml           # <--- New: Docker Compose for multi-container setup
└── ...
```


