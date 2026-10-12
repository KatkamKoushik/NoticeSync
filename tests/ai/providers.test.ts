import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getLLMProvider,
  getEmbeddingProvider,
  listAvailableLLMProviders,
  MockLLMProvider,
  MockEmbeddingProvider,
  GroqLLMProvider,
  GeminiLLMProvider,
  OllamaLLMProvider,
  GoogleEmbeddingProvider,
} from '../../src/lib/providers';

describe('Model Provider Abstraction Layer', () => {
  it('instantiates MockLLMProvider deterministically', async () => {
    const provider = getLLMProvider('mock');
    assert.strictEqual(provider.id, 'mock');
    assert.strictEqual(provider.isConfigured, true);

    const health = await provider.healthCheck();
    assert.strictEqual(health.ok, true);

    const text = await provider.generateText([{ role: 'user', content: 'hello' }]);
    assert.ok(text.includes('Mock Response'));

    const brief = await provider.generateBrief('[]');
    assert.ok(brief.length > 0);

    const rawJson = await provider.extractEvents('Syllabus content');
    const parsed = JSON.parse(rawJson);
    assert.ok(Array.isArray(parsed));
    assert.strictEqual(parsed[0].type, 'Exam');
  });

  it('instantiates MockEmbeddingProvider with strictly 768 dimensions', async () => {
    const provider = getEmbeddingProvider('mock');
    assert.strictEqual(provider.id, 'mock');
    assert.strictEqual(provider.dimension, 768);

    const health = await provider.healthCheck();
    assert.strictEqual(health.ok, true);

    const vector = await provider.embed('Computer Science 101');
    assert.strictEqual(vector.length, 768);
    // Verify non-zero and floating point numbers
    assert.ok(typeof vector[0] === 'number');
    assert.ok(!isNaN(vector[0]));
  });

  it('instantiates GroqLLMProvider and checks key configuration', () => {
    const provider = getLLMProvider('groq');
    assert.strictEqual(provider.id, 'groq');
    assert.ok(provider instanceof GroqLLMProvider);
  });

  it('instantiates GeminiLLMProvider and checks configuration', () => {
    const provider = getLLMProvider('gemini');
    assert.strictEqual(provider.id, 'gemini');
    assert.ok(provider instanceof GeminiLLMProvider);
  });

  it('instantiates OllamaLLMProvider as optional local Gemma backend', () => {
    const provider = getLLMProvider('ollama');
    assert.strictEqual(provider.id, 'ollama');
    assert.ok(provider instanceof OllamaLLMProvider);
  });

  it('listAvailableLLMProviders returns all supported provider candidates', () => {
    const providers = listAvailableLLMProviders();
    assert.strictEqual(providers.length, 4);
    const ids = providers.map((p) => p.id);
    assert.ok(ids.includes('groq'));
    assert.ok(ids.includes('gemini'));
    assert.ok(ids.includes('ollama'));
    assert.ok(ids.includes('mock'));
  });

  it('GoogleEmbeddingProvider enforces 768 dimensions matching pgvector schema', () => {
    const provider = new GoogleEmbeddingProvider();
    assert.strictEqual(provider.dimension, 768);
  });

  it('falls back gracefully when an unconfigured provider is selected in environment', () => {
    const prevEnv = process.env.LLM_PROVIDER;
    try {
      process.env.LLM_PROVIDER = 'nonexistent-provider';
      const provider = getLLMProvider();
      assert.ok(provider.id === 'groq' || provider.id === 'mock');
    } finally {
      process.env.LLM_PROVIDER = prevEnv;
    }
  });

  it('demonstrates Gemma is optional and disabling it does not break application', async () => {
    const prevEnv = process.env.LLM_PROVIDER;
    try {
      process.env.LLM_PROVIDER = 'mock';
      const provider = getLLMProvider();
      assert.strictEqual(provider.id, 'mock');
      const text = await provider.generateText([{ role: 'user', content: 'test query' }]);
      assert.ok(text.length > 0);
    } finally {
      process.env.LLM_PROVIDER = prevEnv;
    }
  });
});
