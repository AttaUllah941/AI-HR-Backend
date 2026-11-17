import { env } from '../../../config/env.js';
import type { AiProvider } from './ai-provider.js';
import { MockAiProvider } from './mock-ai.provider.js';
import { OpenAiCompatibleProvider } from './openai-compatible.provider.js';

export function createAiProvider(): AiProvider {
  if (env.AI_PROVIDER === 'openai' && env.AI_API_KEY) {
    return new OpenAiCompatibleProvider(env.AI_API_KEY, env.AI_BASE_URL, env.AI_MODEL);
  }
  return new MockAiProvider();
}
