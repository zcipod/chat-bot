import { ExaSearchTool } from './exa_search';
import type { Tool } from './base';

// 导出一个所有可用工具的数组
export const tools: Tool[] = [new ExaSearchTool()];

// 创建一个Map，方便在Agent中按名称快速查找工具
export const toolMap = new Map(tools.map(tool => [tool.name, tool]));
