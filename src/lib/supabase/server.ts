import { createClient } from '@supabase/supabase-js';

// The server client initialized with the Service Role Key for privileged operations (e.g. bypassing RLS)
export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  }
);
