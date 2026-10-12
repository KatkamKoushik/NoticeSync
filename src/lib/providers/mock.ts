import {
  LLMProvider,
  EmbeddingProvider,
  ChatMessage,
  ProviderHealth,
} from './types';

export class MockLLMProvider implements LLMProvider {
  public readonly id = 'mock';
  public readonly name = 'Deterministic Mock Provider';
  public readonly isConfigured = true;

  public async generateText(messages: ChatMessage[]): Promise<string> {
    const userMsg = messages.find((m) => m.role === 'user')?.content || '';
    return `[Mock Response] Processed query: "${userMsg.substring(0, 50)}". All deadlines verified.`;
  }

  public async extractEvents(): Promise<string> {
    return JSON.stringify([
      {
        title: 'Midterm Examination',
        date: '2026-11-15',
        type: 'Exam',
        description: 'Covers chapters 1 to 5',
        confidence: 95,
        importance: 'high',
        actionRequired: true,
        strictDeadline: true,
        deadlineChange: 'none',
        deadlineChangeEvidence: null,
        additionalInformationPending: false,
        sourceText: 'Midterm exam will take place on Nov 15.',
        course: 'CS101',
        location: 'Hall 101',
      },
    ]);
  }

  public async generateBrief(): Promise<string> {
    return 'Upcoming midterm scheduled. Action required.';
  }

  public async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, message: 'Mock LLM provider is always healthy' };
  }
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  public readonly id = 'mock';
  public readonly name = 'Deterministic Mock Embedding Provider';
  public readonly dimension = 768;
  public readonly isConfigured = true;

  public async embed(text: string): Promise<number[]> {
    // Generate deterministic 768-dimensional normalized vector from text hash
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    const seed = Math.abs(hash) || 1;
    const vector = new Array(this.dimension);
    let norm = 0;
    for (let i = 0; i < this.dimension; i++) {
      const val = Math.sin((seed + i) * 0.1);
      vector[i] = val;
      norm += val * val;
    }
    const scale = Math.sqrt(norm) || 1;
    return vector.map((v) => Number((v / scale).toFixed(6)));
  }

  public async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, message: 'Mock embedding provider is always healthy' };
  }
}
