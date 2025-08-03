import { z } from 'zod';

// 定义 followup 请求的配置
export interface FollowupConfig {
  // 是否需要 followup 请求
  enabled: boolean;
  // followup 请求的系统提示
  systemPrompt?: string;
  // 过滤工具结果的函数，用于在 followup 请求中移除不必要的信息
  filterResult?: (result: string) => string;
}

// 定义所有工具必须遵循的结构
export interface Tool {
  // 工具名称，用于LLM识别
  name: string;
  // 工具功能的自然语言描述，供LLM理解何时使用
  description: string;
  // 定义工具输入参数的 Zod Schema，用于验证和类型提示
  schema: z.ZodObject<any, any, any>;
  // 执行工具的核心逻辑
  execute(args: z.infer<this['schema']>): Promise<string>;
  // 可选的 followup 配置
  followup?: FollowupConfig;
}
