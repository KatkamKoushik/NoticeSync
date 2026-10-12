import { LLMProvider, ChatMessage, GenerationOptions, ProviderHealth } from './types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SYSTEM_PROMPT, BRIEF_SYSTEM_PROMPT } from './groq';
import { sanitizeUntrustedDocumentContext } from '../validation/security';

export class GeminiLLMProvider implements LLMProvider {
  public readonly id = 'gemini';
  public readonly name = 'Google Gemini LLM';
  public readonly modelName: string;

  constructor(modelName?: string) {
    this.modelName = modelName || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  }

  public get isConfigured(): boolean {
    return this.getKeys().length > 0;
  }

  private getKeys(): string[] {
    return [
      process.env.GEMINI_API_KEY,
      process.env.GEMMA_API_KEY,
      process.env.GEMMA_API_KEY_2,
      process.env.GEMMA_API_KEY_3,
    ].filter(Boolean) as string[];
  }

  private getClient(keyIndex: number = 0): GoogleGenerativeAI {
    const keys = this.getKeys();
    if (keys.length === 0) {
      throw new Error('No GEMINI_API_KEY or GEMMA_API_KEY configured');
    }
    const key = keys[keyIndex % keys.length];
    return new GoogleGenerativeAI(key);
  }

  public async generateText(
    messages: ChatMessage[],
    options?: GenerationOptions
  ): Promise<string> {
    const keys = this.getKeys();
    if (keys.length === 0) {
      if (
        process.env.NODE_ENV === 'test' ||
        process.env.NOTICE_SYNC_TEST_MODE === 'true'
      ) {
        return 'Deterministic test response from Gemini adapter.';
      }
      throw new Error('Gemini API keys not configured');
    }

    let lastError: Error | null = null;
    for (let i = 0; i < keys.length; i++) {
      try {
        const client = this.getClient(i);
        const model = client.getGenerativeModel({
          model: this.modelName,
          generationConfig: {
            temperature: options?.temperature ?? 0.2,
            maxOutputTokens: options?.maxTokens ?? 2048,
          },
        });

        const systemMsg = messages.find((m) => m.role === 'system');
        const userMsgs = messages.filter((m) => m.role !== 'system');
        const prompt = [
          systemMsg ? `SYSTEM DIRECTIVE:\n${systemMsg.content}\n\n` : '',
          userMsgs.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n'),
        ].join('');

        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastError || new Error('All Gemini API keys failed');
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
    if (!this.isConfigured) {
      return { ok: false, message: 'No Gemini API keys configured' };
    }
    const start = Date.now();
    try {
      const client = this.getClient(0);
      const model = client.getGenerativeModel({ model: this.modelName });
      const res = await model.generateContent('ping');
      const text = res.response.text();
      return {
        ok: !!text,
        latencyMs: Date.now() - start,
        message: 'Google Gemini operational',
      };
    } catch (e: unknown) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        message: e instanceof Error ? e.message : 'Gemini unreachable',
      };
    }
  }
}
