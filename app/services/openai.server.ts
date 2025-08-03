import { createOpenAI } from '@ai-sdk/openai';
import OpenAI from 'openai';

// createOpenAI will automatically use the OPENAI_API_KEY and OPENAI_BASE_URL
// environment variables. You can also pass them in explicitly.
export const openai = createOpenAI();

// Standard OpenAI client for API calls like listing models
export const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});