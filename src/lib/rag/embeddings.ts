// lib/embeddings.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

// Use the exact same API key you generated for Gemma/Gemini!

export async function getEmbedding(text: string): Promise<number[]> {
  const keys = [
    process.env.GEMMA_API_KEY,
    process.env.GEMMA_API_KEY_2,
    process.env.GEMMA_API_KEY_3,
  ].filter(Boolean) as string[];

  if (keys.length === 0) {
    throw new Error('No GEMMA_API_KEY configured');
  }

  let lastError: any = null;

  for (const key of keys) {
    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: "gemini-embedding-2" });
      
      // Request exactly 768 dimensions to match our Supabase schema
      const result = await model.embedContent({
        content: { role: 'user', parts: [{ text }] },
        outputDimensionality: 768
      } as any);
      
      return result.embedding.values; 
    } catch (error: any) {
      console.error(`Google Embedding failed for a key:`, error?.message || error);
      lastError = error;
      // If it's a rate limit or auth error, try the next key
      continue;
    }
  }

  throw new Error("Failed to generate embedding: All keys exhausted. Last error: " + (lastError?.message || lastError));
}
