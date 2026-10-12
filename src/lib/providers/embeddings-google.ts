import { EmbeddingProvider, ProviderHealth } from './types';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class GoogleEmbeddingProvider implements EmbeddingProvider {
  public readonly id = 'google';
  public readonly name = 'Google Generative AI Embeddings';
  public readonly dimension = 768;
  public readonly modelName: string;

  constructor(modelName?: string) {
    this.modelName = modelName || process.env.EMBEDDING_MODEL || 'gemini-embedding-2';
  }

  public get isConfigured(): boolean {
    return this.getKeys().length > 0;
  }

  private getKeys(): string[] {
    return [
      process.env.GEMMA_API_KEY,
      process.env.GEMMA_API_KEY_2,
      process.env.GEMMA_API_KEY_3,
      process.env.GEMINI_API_KEY,
    ].filter(Boolean) as string[];
  }

  public async embed(text: string): Promise<number[]> {
    const keys = this.getKeys();
    const isTestMode =
      process.env.NODE_ENV === 'test' ||
      process.env.NOTICE_SYNC_TEST_MODE === 'true';

    if (keys.length === 0) {
      if (isTestMode) {
        return Array(this.dimension).fill(0.01);
      }
      throw new Error('No GEMMA_API_KEY or GEMINI_API_KEY configured for embeddings');
    }

    let lastError: Error | null = null;
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: this.modelName });

        const result = await model.embedContent({
          content: { role: 'user', parts: [{ text }] },
          outputDimensionality: this.dimension,
        } as Parameters<typeof model.embedContent>[0]);

        const values = result.embedding.values;
        if (!Array.isArray(values) || values.length !== this.dimension) {
          throw new Error(
            `Embedding dimension mismatch: expected ${this.dimension}, received ${values?.length}`
          );
        }
        return values;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`Google Embedding failed on key index ${index}. Trying fallback.`);
      }
    }

    throw new Error(
      `Failed to generate embedding: All keys exhausted. Last error: ${lastError?.message || 'Unknown'}`
    );
  }

  public async healthCheck(): Promise<ProviderHealth> {
    if (!this.isConfigured) {
      return { ok: false, message: 'No Google embedding keys configured' };
    }
    const start = Date.now();
    try {
      const vector = await this.embed('health test');
      return {
        ok: vector.length === this.dimension,
        latencyMs: Date.now() - start,
        message: 'Google embedding operational',
      };
    } catch (e: unknown) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        message: e instanceof Error ? e.message : 'Google embedding unreachable',
      };
    }
  }
}
