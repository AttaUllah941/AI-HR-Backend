export type AiChatRole = 'system' | 'user' | 'assistant';

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface AiCompletionRequest {
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface AiCompletionUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface AiCompletionResult {
  content: string;
  model?: string;
  usage?: AiCompletionUsage;
}

export interface AiProvider {
  readonly name: string;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}
