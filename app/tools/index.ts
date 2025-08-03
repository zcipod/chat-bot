import { ExaSearchTool } from './exa_search';
import type { Tool } from './base';

export const tools: Tool[] = [];

if (process.env.EXA_API_KEY && !/YOUR-EXA-API-KEY/.test(process.env.EXA_API_KEY)) {
  tools.push(new ExaSearchTool());
}

// Tool Map for LLM quick lookup by name
export const toolMap = new Map(tools.map(tool => [tool.name, tool]));
