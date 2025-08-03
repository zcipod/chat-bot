import type { Tool, FollowupConfig } from './base';
import { z } from 'zod';
import { search } from '../services/exa.server';

export class ExaSearchTool implements Tool {
  name = 'exa_search';
  description = '当需要回答关于最新事件或需要来自网络的信息时，使用此工具进行搜索。';
  schema = z.object({
    query: z.string().describe('The search query to find information for.'),
  });

  // Followup 配置：要求 LLM 引用信息来源，并过滤不必要的字段
  followup: FollowupConfig = {
    enabled: true,
    systemPrompt: "Based on the search results provided, please provide a comprehensive response to the user's question. You MUST cite your sources by including the URLs and titles of the articles you reference. When mentioning information from the search results, always include the source URL in your response.",
    filterResult: (result: string) => {
      try {
        const parsed = JSON.parse(result);
        // 移除 searchType 字段和 results 中的 publishedDate, author, image 字段
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
        // 如果解析失败，返回原始结果
        return result;
      }
    }
  };

  async execute({ query }: z.infer<typeof this.schema>): Promise<string> {
    // console.log(`Executing Exa search with query: "${query}"`);
    const searchResults = await search(query);
    // console.log('Exa search results:', searchResults);

    // searchAndContents 方法将内容摘要直接包含在每个结果的 text 字段中
    // 这样 LLM 可以同时获得搜索结果的元数据和内容摘要
    const results = (searchResults as any).results || [];

    const formattedResults = {
      query: query,
      searchType: (searchResults as any).resolvedSearchType,
      results: results.map((result: any) => ({
        title: result.title,
        url: result.url,
        publishedDate: result.publishedDate,
        author: result.author,
        text: result.text, // 这里包含了内容摘要
        image: result.image
      }))
    };

    // 将完整的搜索结果和内容摘要序列化为字符串，返回给LLM
    return JSON.stringify(formattedResults, null, 2);
  }
}
