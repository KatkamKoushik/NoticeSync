import {
  LLMProvider,
  EmbeddingProvider,
  ProviderHealth,
} from './types';
import { GroqLLMProvider } from './groq';
import { GeminiLLMProvider } from './gemini';
import { OllamaLLMProvider } from './ollama';
import { MockLLMProvider, MockEmbeddingProvider } from './mock';
import { GoogleEmbeddingProvider } from './embeddings-google';

export * from './types';
export { GroqLLMProvider } from './groq';
export { GeminiLLMProvider } from './gemini';
export { OllamaLLMProvider } from './ollama';
export { MockLLMProvider, MockEmbeddingProvider } from './mock';
export { GoogleEmbeddingProvider } from './embeddings-google';

/**
 * Returns the configured LLM provider based on environment variables or explicit override.
 * Gemma/Local Ollama, Google Gemini, and Groq are fully decoupled.
 * Gemma is optional and does not break the application when unavailable.
 */
export function getLLMProvider(requestedId?: string): LLMProvider {
  const isTestMode =
    process.env.NODE_ENV === 'test' ||
    process.env.NOTICE_SYNC_TEST_MODE === 'true';

  const providerId = (
    requestedId ||
    process.env.LLM_PROVIDER ||
    'groq'
  ).toLowerCase().trim();

  // Explicit mock requested or forced test mode with no keys
  if (providerId === 'mock') {
    return new MockLLMProvider();
  }

  // Ollama / Local Gemma
  if (providerId === 'ollama' || providerId === 'gemma-local' || providerId === 'gemma') {
    const ollama = new OllamaLLMProvider();
    if (requestedId || ollama.isConfigured || isTestMode) {
      return ollama;
    }
    console.warn(
      `[NoticeSync Provider] Ollama requested but not configured. Falling back to Groq.`
    );
  }

  // Google Gemini
  if (providerId === 'gemini' || providerId === 'google') {
    const gemini = new GeminiLLMProvider();
    if (requestedId || gemini.isConfigured || isTestMode) {
      return gemini;
    }
    console.warn(
      `[NoticeSync Provider] Gemini requested but no keys found. Falling back to Groq.`
    );
  }

  // Default: Groq Hosted LLM
  const groq = new GroqLLMProvider();
  if (groq.isConfigured || isTestMode) {
    return groq;
  }

  // If no live keys exist in test environment, return Mock provider
  if (isTestMode) {
    return new MockLLMProvider();
  }

  // Return groq anyway so its explicit missing-key exception explains required variables
  return groq;
}

/**
 * Returns the configured Embedding provider based on environment variables or explicit override.
 */
export function getEmbeddingProvider(requestedId?: string): EmbeddingProvider {
  const isTestMode =
    process.env.NODE_ENV === 'test' ||
    process.env.NOTICE_SYNC_TEST_MODE === 'true';

  const providerId = (
    requestedId ||
    process.env.EMBEDDING_PROVIDER ||
    'google'
  ).toLowerCase().trim();

  if (providerId === 'mock') {
    return new MockEmbeddingProvider();
  }

  const google = new GoogleEmbeddingProvider();
  if (google.isConfigured || isTestMode) {
    return google;
  }

  if (isTestMode) {
    return new MockEmbeddingProvider();
  }

  return google;
}

/**
 * Lists all registered LLM providers with configuration status.
 */
export function listAvailableLLMProviders(): Array<{
  id: string;
  name: string;
  isConfigured: boolean;
}> {
  const groq = new GroqLLMProvider();
  const gemini = new GeminiLLMProvider();
  const ollama = new OllamaLLMProvider();
  const mock = new MockLLMProvider();

  return [
    { id: groq.id, name: groq.name, isConfigured: groq.isConfigured },
    { id: gemini.id, name: gemini.name, isConfigured: gemini.isConfigured },
    { id: ollama.id, name: ollama.name, isConfigured: ollama.isConfigured },
    { id: mock.id, name: mock.name, isConfigured: mock.isConfigured },
  ];
}

/**
 * Probes operational health of currently active providers.
 */
export async function getActiveProviderStatus(): Promise<{
  llm: { id: string; health: ProviderHealth };
  embedding: { id: string; health: ProviderHealth };
}> {
  const llm = getLLMProvider();
  const embedding = getEmbeddingProvider();

  const [llmHealth, embeddingHealth] = await Promise.all([
    llm.healthCheck().catch((err) => ({
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    })),
    embedding.healthCheck().catch((err) => ({
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    })),
  ]);

  return {
    llm: { id: llm.id, health: llmHealth },
    embedding: { id: embedding.id, health: embeddingHealth },
  };
}
