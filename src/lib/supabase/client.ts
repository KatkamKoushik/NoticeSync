import { createClient } from '@supabase/supabase-js';

// The regular client for public/anon operations (can be used on client or server)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
