import { supabaseServer } from '../supabase/server';
import { getEmbedding } from './embeddings';

export interface StoreChunkParams {
  userId: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  pageNumber?: number;
  metadata?: any;
}

export async function storeChunk(params: StoreChunkParams) {
  // Generate the embedding
  const embedding = await getEmbedding(params.content);
  
  // Store the chunk in Supabase
  const { data, error } = await supabaseServer
    .from('document_chunks')
    .insert({
      user_id: params.userId,
      document_id: params.documentId,
      content: params.content,
      embedding: embedding,
      chunk_index: params.chunkIndex,
      page_number: params.pageNumber,
      metadata: params.metadata || {}
    })
    .select('id')
    .single();
    
  if (error) {
    console.error('Failed to store chunk:', error);
    throw error;
  }
  
  return data;
}

export interface RetrieveParams {
  query: string;
  userId: string;
  matchCount?: number;
  matchThreshold?: number;
}

export interface RetrievedChunk {
  id: string;
  document_id: string;
  content: string;
  metadata: any;
  similarity: number;
}

export async function retrieveRelevantChunks(params: RetrieveParams): Promise<RetrievedChunk[]> {
  const queryEmbedding = await getEmbedding(params.query);
  
  const { data, error } = await supabaseServer.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: params.matchThreshold || 0.6,
    match_count: params.matchCount || 5,
    p_user_id: params.userId
  });
  
  if (error) {
    console.error('Failed to retrieve chunks:', error);
    throw error;
  }
  
  return data as RetrievedChunk[];
}
