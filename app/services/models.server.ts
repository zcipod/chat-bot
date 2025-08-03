import { openaiClient } from './openai.server';

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

export async function getAvailableModels(): Promise<ModelInfo[]> {
  try {
    console.log('Fetching models from OpenAI...');
    const models = await openaiClient.models.list();
    
    // 过滤出GPT模型并格式化
    const gptModels = models.data
      .filter(model => model.id.includes('gpt'))
      .map(model => ({
        id: model.id,
        name: formatModelName(model.id),
        description: `OpenAI ${model.id}`
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return gptModels;
  } catch (error) {
    console.error('Failed to fetch models:', error);
    // 返回默认模型列表作为后备
    return [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Latest GPT-4 model' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Fast GPT-4 model' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient' }
    ];
  }
}

function formatModelName(modelId: string): string {
  return modelId
    .replace('gpt-', 'GPT-')
    .replace('-', ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}