'use client';

import { Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AcademicEvent } from '@/lib/types';

interface AcademicBriefProps {
  events: AcademicEvent[];
}

export default function AcademicBrief({ events }: AcademicBriefProps) {
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBrief() {
      if (events.length === 0) {
        setBrief("No events found to summarize.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events }),
        });
        
        if (!res.ok) {
          throw new Error("Failed to generate brief");
        }
        
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        setBrief(data.brief);
      } catch (err: any) {
        setError(err.message || 'Could not load academic brief.');
      } finally {
        setLoading(false);
      }
    }

    fetchBrief();
  }, [events]);

  return (
    <div className="card p-4 flex flex-col gap-3 relative overflow-hidden bg-gradient-to-br from-indigo-950/20 to-purple-900/10 border-indigo-500/20">
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <Sparkles size={48} />
      </div>
      
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-indigo-400" />
        <h3 className="font-semibold text-sm text-indigo-300">AI Academic Brief</h3>
      </div>
      
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
          <Loader2 size={14} className="animate-spin" />
          Analyzing your schedule...
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-red-400 py-2 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
          <AlertCircle size={14} />
          {error}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-gray-300 relative z-10 whitespace-pre-wrap">
          {brief}
        </p>
      )}
    </div>
  );
}
