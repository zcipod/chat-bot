import OpenAI from 'openai';

// Standard OpenAI client for all API calls
export const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});