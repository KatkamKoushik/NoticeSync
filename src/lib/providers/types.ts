/**
 * NoticeSync Model Provider Abstraction
 * Defines provider contracts for LLM text/event generation and vector embeddings.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderHealth {
  ok: boolean;
  message?: string;
  latencyMs?: number;
}

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly isConfigured: boolean;

  /**
   * Generates conversational text or answers for given messages.
   */
  generateText(
    messages: ChatMessage[],
    options?: GenerationOptions
  ): Promise<string>;

  /**
   * Performs academic event extraction with system directives and untrusted boundaries.
   */
  extractEvents(
    extractedText: string,
    repairInstruction?: string
  ): Promise<string>;

  /**
   * Generates a concise academic brief summarizing confirmed events.
   */
  generateBrief(eventsJson: string): Promise<string>;

  /**
   * Checks if this provider is reachable and active.
   */
  healthCheck(): Promise<ProviderHealth>;
}

export interface EmbeddingProvider {
  readonly id: string;
  readonly name: string;
  readonly dimension: number;
  readonly isConfigured: boolean;

  /**
   * Generates a dense vector embedding for the input text.
   * Guarantees length matches this.dimension (768 for NoticeSync schema).
   */
  embed(text: string): Promise<number[]>;

  /**
   * Checks if this embedding provider is operational.
   */
  healthCheck(): Promise<ProviderHealth>;
}
