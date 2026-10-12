/**
 * Simple text chunking utility for RAG
 */

export function chunkText(text: string, maxChunkSize = 1000, overlap = 200): string[] {
  if (!text || text.trim().length === 0) return [];
  
  const chunks: string[] = [];
  let startIndex = 0;
  
  while (startIndex < text.length) {
    const endIndex = startIndex + maxChunkSize;
    
    if (endIndex >= text.length) {
      chunks.push(text.substring(startIndex));
      break;
    }
    
    // Try to find a good breaking point (newline or period) within the chunk
    const substring = text.substring(startIndex, endIndex);
    const lastNewline = substring.lastIndexOf('\n');
    const lastPeriod = substring.lastIndexOf('. ');
    
    let breakPoint = endIndex;
    
    // Prefer to break at a newline if it's in the second half of the chunk
    if (lastNewline > maxChunkSize * 0.5) {
      breakPoint = startIndex + lastNewline + 1;
    } 
    // Fall back to breaking at a sentence end
    else if (lastPeriod > maxChunkSize * 0.5) {
      breakPoint = startIndex + lastPeriod + 2;
    }
    
    chunks.push(text.substring(startIndex, breakPoint).trim());
    
    // Move start index, incorporating overlap
    let nextStartIndex = breakPoint - overlap;
    
    // Ensure we always make progress to avoid infinite loops
    if (nextStartIndex <= startIndex) {
      nextStartIndex = breakPoint;
    }
    startIndex = Math.max(0, nextStartIndex);
  }
  
  return chunks.filter(c => c.length > 0);
}
