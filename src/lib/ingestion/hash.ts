import crypto from 'crypto';

/**
 * Computes a deterministic SHA-256 hash for document content to prevent duplicate records.
 */
export function computeContentHash(userId: string, sourceType: string, content: string | Buffer): string {
  const hash = crypto.createHash('sha256');
  hash.update(userId);
  hash.update(':');
  hash.update(sourceType);
  hash.update(':');
  hash.update(content);
  return hash.digest('hex');
}

export interface EventDedupInputs {
  title: string;
  date?: string | null;
  type: string;
  course?: string | null;
  sourceExcerpt?: string;
  description?: string;
}

/**
 * Computes a deterministic deduplication hash for an academic event.
 * Avoids merging distinct events with similar titles by scoping to course and excerpt fingerprints,
 * while reliably deduplicating exact identical notices across retries.
 */
export function computeEventDedupHash(
  inputOrTitle: string | EventDedupInputs,
  dateParam?: string | null,
  typeParam?: string,
  courseParam?: string | null
): string {
  let title = '';
  let date: string | null | undefined = null;
  let type = '';
  let course: string | null | undefined = null;
  let excerpt: string | null | undefined = null;

  if (typeof inputOrTitle === 'object' && inputOrTitle !== null) {
    title = inputOrTitle.title;
    date = inputOrTitle.date;
    type = inputOrTitle.type;
    course = inputOrTitle.course;
    excerpt = inputOrTitle.sourceExcerpt || inputOrTitle.description;
  } else {
    title = inputOrTitle;
    date = dateParam;
    type = typeParam || 'Notice';
    course = courseParam;
  }

  const normalizedTitle = (title || '').toLowerCase().trim().replace(/[.,;:]+$/, '').replace(/\s+/g, ' ');
  const normalizedCourse = (course || '').toLowerCase().trim();
  const normalizedType = (type || 'notice').toLowerCase().trim();
  const normalizedDate = date ? date.trim() : 'undated';

  const hash = crypto.createHash('sha256');
  hash.update(normalizedCourse || 'nocourse');
  hash.update(':');
  hash.update(normalizedType);
  hash.update(':');
  hash.update(normalizedTitle);
  hash.update(':');
  hash.update(normalizedDate);

  // If undated, incorporate excerpt fingerprint to avoid colliding two distinct undated notices
  if (normalizedDate === 'undated' && excerpt) {
    const excerptSnippet = excerpt.toLowerCase().trim().replace(/\s+/g, ' ').substring(0, 80);
    hash.update(':');
    hash.update(excerptSnippet);
  }

  return hash.digest('hex');
}
