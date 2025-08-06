import { openaiClient } from './openai.server';

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

// 缓存相关变量
let modelsCache: ModelInfo[] | null = null;
let modelsCacheExpiry: number = 0;
let titleGeneratorCache: ModelInfo | null = null;
let titleGeneratorCacheExpiry: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

export async function getAvailableModels(): Promise<ModelInfo[]> {
  // 检查缓存是否有效
  const now = Date.now();
  if (modelsCache && now < modelsCacheExpiry) {
    return modelsCache;
  }

  try {
    console.log('Fetching models from OpenAI...');
    const models = await openaiClient.models.list();
    
    // 格式化模型
    const gptModels = models.data
      // .filter(model => model.id.includes('gpt'))
      .map(model => ({
        id: model.id,
        name: formatModelName(model.id),
        description: `OpenAI ${model.id}`
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // 更新缓存
    modelsCache = gptModels;
    modelsCacheExpiry = now + CACHE_DURATION;

    return gptModels;
  } catch (error) {
    console.error('Failed to fetch models:', error);
    // 返回默认模型列表作为后备
    const defaultModels = [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Latest GPT-4 model' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Fast GPT-4 model' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient' }
    ];
    
    // 即使出错也缓存默认模型
    modelsCache = defaultModels;
    modelsCacheExpiry = now + CACHE_DURATION;
    
    return defaultModels;
  }
}

export async function getTitleGenerator(): Promise<ModelInfo> {
  // 检查缓存是否有效
  const now = Date.now();
  if (titleGeneratorCache && now < titleGeneratorCacheExpiry) {
    console.log('Returning cached title generator model');
    return titleGeneratorCache;
  }

  try {
    // 获取所有可用模型
    const models = await getAvailableModels();
    
    // 查找 gpt-4.1-nano 模型
    const titleModel = models.find(model => 
      model.id.includes('gpt-4.1-nano') || model.id.includes('4.1-nano')
    );

    if (titleModel) {
      // 更新缓存
      titleGeneratorCache = titleModel;
      titleGeneratorCacheExpiry = now + CACHE_DURATION;
      return titleModel;
    }

    // 如果没有找到 4o-mini，使用默认的轻量级模型
    const fallbackModel = { 
      id: 'gpt-4o-mini', 
      name: 'GPT-4o Mini', 
      description: 'Fast and efficient model for title generation' 
    };
    
    titleGeneratorCache = fallbackModel;
    titleGeneratorCacheExpiry = now + CACHE_DURATION;
    
    return fallbackModel;
  } catch (error) {
    console.error('Failed to get title generator model:', error);
    
    // 返回默认模型
    const fallbackModel = { 
      id: 'gpt-4o-mini', 
      name: 'GPT-4o Mini', 
      description: 'Fast and efficient model for title generation' 
    };
    
    titleGeneratorCache = fallbackModel;
    titleGeneratorCacheExpiry = now + CACHE_DURATION;
    
    return fallbackModel;
  }
}

function formatModelName(modelId: string): string {
  return modelId
    .replace('gpt-', 'GPT-')
    .replace('-', ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}
