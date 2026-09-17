import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // For a real app, user_id comes from auth
    // For this demo, we'll generate or accept a session user_id
    const { userId = '00000000-0000-0000-0000-000000000000' } = await req.json().catch(() => ({}));

    const { data, error } = await supabaseServer
      .from('processing_jobs')
      .insert({
        user_id: userId,
        status: 'pending',
        current_step: 'Initializing...',
        progress: 0
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({ jobId: data.id });
  } catch (error: any) {
    console.error('Failed to create job:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
