import { streamText, Message, experimental_fallback } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { getEmbedding } from '@/lib/rag/embeddings';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Initialize multiple Groq providers with the available keys
const keys = [
  process.env.GROQ_API_KEY_1,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4,
  process.env.GROQ_API_KEY_5,
  process.env.GROQ_API_KEY_6,
].filter(Boolean) as string[];

const groqModels = keys.map(key => {
  const groq = createGroq({ apiKey: key });
  return groq('openai/gpt-oss-20b'); // Highly reliable for RAG tasks
});

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    const userQuery = lastMessage.content;

    // We can hardcode userId for this demo
    const userId = '00000000-0000-0000-0000-000000000000';

    // 1. Get embedding for the user's question
    const queryEmbedding = await getEmbedding(userQuery);

    // 2. Perform similarity search in Supabase
    const { data: chunks, error } = await supabaseServer.rpc('match_document_chunks', {
      p_user_id: userId,
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: 5
    });

    if (error) {
      console.error('Error fetching chunks for RAG:', error);
    }

    // 3. Build Context
    let contextStr = '';
    if (chunks && chunks.length > 0) {
      contextStr = chunks.map((c: any) => `[Source: ${c.metadata?.title || 'Unknown Document'}]\n${c.content}`).join('\n\n');
    } else {
      contextStr = 'No relevant documents found in the academic memory.';
    }

    // 4. Create the System Prompt
    const systemPrompt = `You are NoticeSync, an intelligent academic copilot.
Your job is to answer the student's question accurately using ONLY the provided syllabus and circular context below.
If the answer is not contained in the context, clearly state that you don't know based on the uploaded documents.
Do not hallucinate or invent dates. Keep answers concise, friendly, and well-formatted.

CONTEXT:
${contextStr}`;

    // 5. Generate and Stream Response using fallback models
    if (groqModels.length === 0) {
      throw new Error('No Groq API keys configured.');
    }

    const result = streamText({
      model: experimental_fallback(groqModels),
      system: systemPrompt,
      messages: messages as Message[],
    });

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
