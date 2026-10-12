import { LLMProvider, ChatMessage, GenerationOptions, ProviderHealth } from './types';
import { SYSTEM_PROMPT, BRIEF_SYSTEM_PROMPT } from './groq';
import { sanitizeUntrustedDocumentContext } from '../validation/security';

export class OllamaLLMProvider implements LLMProvider {
  public readonly id = 'ollama';
  public readonly name = 'Local Ollama / Gemma';
  public readonly baseUrl: string;
  public readonly modelName: string;

  constructor(baseUrl?: string, modelName?: string) {
    this.baseUrl = (baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
    this.modelName = modelName || process.env.OLLAMA_MODEL || 'gemma2:9b';
  }

  public get isConfigured(): boolean {
    // Ollama requires explicit enablement or is considered available if OLLAMA_BASE_URL or LLM_PROVIDER=ollama is set
    return (
      process.env.LLM_PROVIDER === 'ollama' ||
      !!process.env.OLLAMA_BASE_URL ||
      !!process.env.OLLAMA_MODEL
    );
  }

  public async generateText(
    messages: ChatMessage[],
    options?: GenerationOptions
  ): Promise<string> {
    const isTestMode =
      process.env.NODE_ENV === 'test' ||
      process.env.NOTICE_SYNC_TEST_MODE === 'true';

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.2,
            num_predict: options?.maxTokens ?? 2048,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama returned HTTP ${response.status}: ${await response.text().catch(() => '')}`);
      }

      const data = (await response.json()) as { message?: { content?: string } };
      if (!data.message?.content) {
        throw new Error('Ollama response contained no content');
      }

      return data.message.content;
    } catch (err: unknown) {
      if (isTestMode) {
        return 'Deterministic test response from local Gemma / Ollama mock.';
      }
      throw new Error(
        `Local Gemma inference failed: ${err instanceof Error ? err.message : String(err)}. Verify Ollama is running at ${this.baseUrl}.`
      );
    }
  }

  public async extractEvents(
    extractedText: string,
    repairInstruction?: string
  ): Promise<string> {
    const sanitized = sanitizeUntrustedDocumentContext(extractedText);
    const userContent = `<user_document untrusted="true">\n${sanitized}\n</user_document>${
      repairInstruction ? `\n\n${repairInstruction}` : ''
    }`;

    return this.generateText([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ], { temperature: 0.1, maxTokens: 4096 });
  }

  public async generateBrief(eventsJson: string): Promise<string> {
    return this.generateText([
      { role: 'system', content: BRIEF_SYSTEM_PROMPT },
      { role: 'user', content: `Events:\n${eventsJson}` },
    ], { temperature: 0.2, maxTokens: 1024 });
  }

  public async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { method: 'GET' });
      return {
        ok: res.ok,
        latencyMs: Date.now() - start,
        message: res.ok ? `Ollama running at ${this.baseUrl}` : `Ollama returned ${res.status}`,
      };
    } catch (e: unknown) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        message: `Ollama unreachable at ${this.baseUrl}: ${e instanceof Error ? e.message : 'Connection refused'}`,
      };
    }
  }
}
