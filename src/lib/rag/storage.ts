import { SupabaseClient } from '@supabase/supabase-js';
import { getEmbedding } from './embeddings';
import { requireValidUuid, SecurityValidationError } from '../validation/security';
import { withRetry } from '../resilience/retry';
import { createMockTestClient } from '../auth/server';

export interface StoreChunkParams {
  userId: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  pageNumber?: number;
  metadata?: Record<string, unknown>;
  client?: SupabaseClient;
}

export interface RetrievedChunk {
  id: string;
  document_id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

export interface RetrieveParams {
  query: string;
  userId: string;
  matchCount?: number;
  matchThreshold?: number;
  client?: SupabaseClient;
}

function resolveClient(client?: SupabaseClient, userId?: string): SupabaseClient {
  if (client) return client;
  if (process.env.NODE_ENV === 'test' || process.env.NOTICE_SYNC_TEST_MODE === 'true') {
    return createMockTestClient(userId || '00000000-0000-4000-8000-000000000000');
  }
  throw new SecurityValidationError(
    'User-scoped Supabase client is required for RAG operations. Privileged service role fallback is prohibited.',
    403
  );
}

/**
 * Stores an embedded document chunk with strict document ownership validation.
 * Uses upsert with unique key (document_id, chunk_index) for retry idempotency.
 * Incorporates bounded exponential backoff retries for transient embedding failures.
 */
export async function storeChunk(params: StoreChunkParams) {
  const userId = requireValidUuid(params.userId, 'userId');
  const documentId = requireValidUuid(params.documentId, 'documentId');
  const db = resolveClient(params.client, userId);

  // 1. Verify document exists and belongs to the specified userId
  const { data: doc, error: docError } = await db
    .from('documents')
    .select('id, user_id')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single();

  if (docError || !doc) {
    throw new SecurityValidationError(
      'Document not found or ownership mismatch: Cannot associate chunk with another user document.',
      403
    );
  }

  // 2. Generate the embedding with safe transient retry
  const embedding = await withRetry(
    async () => getEmbedding(params.content),
    {
      maxAttempts: 3,
      initialDelayMs: 300,
      maxDelayMs: 2000,
    }
  );

  if (!Array.isArray(embedding) || embedding.length !== 768) {
    throw new Error(
      `Embedding dimension mismatch: expected 768 to match vector(768) schema, received ${
        Array.isArray(embedding) ? embedding.length : typeof embedding
      }`
    );
  }

  // 3. Store or upsert the chunk in Supabase (idempotent across retries)
  const { data, error } = await db
    .from('document_chunks')
    .upsert(
      {
        user_id: userId,
        document_id: documentId,
        content: params.content,
        embedding: embedding,
        chunk_index: params.chunkIndex,
        page_number: params.pageNumber,
        metadata: params.metadata || {},
      },
      {
        onConflict: 'document_id,chunk_index',
      }
    )
    .select('id')
    .single();

  if (error) {
    console.error('Failed to store chunk:', error.message);
    throw error;
  }

  return data;
}

/**
 * Computes a normalized lexical match score (0.0 to 1.0) for a chunk based on query tokens.
 */
export function computeLexicalScore(content: string, query: string): number {
  if (!content || !query) return 0;
  const lowerContent = content.toLowerCase();
  const tokens = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 2 &&
        !['the', 'and', 'for', 'with', 'what', 'when', 'where', 'which', 'how', 'about'].includes(w)
    );

  if (tokens.length === 0) return 0;

  let matched = 0;
  for (const token of tokens) {
    if (lowerContent.includes(token)) {
      matched++;
    }
  }
  return matched / tokens.length;
}

/**
 * Retrieves chunks relevant to a query using hybrid vector and lexical ranking,
 * strictly isolated to the specified user.
 */
export async function retrieveRelevantChunks(params: RetrieveParams): Promise<RetrievedChunk[]> {
  const userId = requireValidUuid(params.userId, 'userId');
  const db = resolveClient(params.client, userId);

  // Generate the embedding for the query with safe retry
  const queryEmbedding = await withRetry(
    async () => getEmbedding(params.query),
    { maxAttempts: 3, initialDelayMs: 300, maxDelayMs: 2000 }
  );

  const matchThreshold = typeof params.matchThreshold === 'number'
    ? Math.max(0, Math.min(1, params.matchThreshold))
    : 0.6;
  const matchCount = typeof params.matchCount === 'number'
    ? Math.max(1, Math.min(20, params.matchCount))
    : 5;

  const { data, error } = await db.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: matchCount * 2, // Retrieve wider candidate pool for hybrid reranking
    p_user_id: userId,
  });

  if (error) {
    console.error('Failed to retrieve chunks for user:', error.message);
    throw error;
  }

  const rawChunks = (data || []) as RetrievedChunk[];

  // Apply hybrid fusion: 75% vector cosine similarity + 25% lexical term match
  const scoredChunks = rawChunks.map((chunk) => {
    const lexScore = computeLexicalScore(chunk.content, params.query);
    const vectorSim = typeof chunk.similarity === 'number' ? chunk.similarity : 0.5;
    const hybridSimilarity = Number((0.75 * vectorSim + 0.25 * lexScore).toFixed(4));
    return {
      ...chunk,
      similarity: hybridSimilarity,
    };
  });

  // Rank by hybrid similarity descending
  scoredChunks.sort((a, b) => b.similarity - a.similarity);

  return scoredChunks.slice(0, matchCount);
}
