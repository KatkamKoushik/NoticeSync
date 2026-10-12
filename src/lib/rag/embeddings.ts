import { getEmbeddingProvider } from '../providers';

/**
 * Generates vector embedding using the configured Embedding provider.
 * Guarantees 768 dimensions to match the PostgreSQL schema.
 * Pluggable via EMBEDDING_PROVIDER environment variable ('google' | 'mock').
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const provider = getEmbeddingProvider();
  return provider.embed(text);
}
