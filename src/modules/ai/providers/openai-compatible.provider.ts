import type { AiCompletionRequest, AiCompletionResult, AiProvider } from './ai-provider.js';

/**
 * OpenAI-compatible Chat Completions provider.
 * Only used when AI_PROVIDER=openai and AI_API_KEY is set.
 * Keys never leave the server.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = 'openai';

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const controller = new AbortController();
    const timeoutMs = 60_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          temperature: request.temperature ?? 0.3,
          max_tokens: request.maxTokens ?? 1200,
          messages: request.messages,
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`AI provider timed out after ${timeoutMs / 1000}s`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI provider error (${response.status}): ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('AI provider returned an empty completion');
    }

    return {
      content,
      model: data.model ?? this.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      },
    };
  }
}
