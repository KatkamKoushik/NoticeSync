'use client';

import { AlertTriangle, Clock, AlertCircle } from 'lucide-react';
import type { AcademicEvent } from '@/lib/types';
import { differenceInDays, parseISO, isValid, format } from 'date-fns';

export default function AttentionView({ events }: { events: AcademicEvent[] }) {
  // Filter for events that need attention
  const attentionItems = events.filter((e) => {
    if (e.needsReview) return true;
    if (e.importance === 'high') return true;
    
    if (e.date) {
      const parsedDate = parseISO(e.date);
      if (isValid(parsedDate)) {
        const days = differenceInDays(parsedDate, new Date());
        if (days >= 0 && days <= 7) return true; // Due in next 7 days
      }
    }
    return false;
  }).sort((a, b) => {
    if (a.needsReview && !b.needsReview) return -1;
    if (!a.needsReview && b.needsReview) return 1;
    
    if (a.importance === 'high' && b.importance !== 'high') return -1;
    if (a.importance !== 'high' && b.importance === 'high') return 1;
    
    if (a.date && b.date) {
      return a.date.localeCompare(b.date);
    }
    return 0;
  }).slice(0, 5); // Top 5

  if (attentionItems.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <AlertTriangle className="text-yellow-500" size={20} />
        What needs your attention?
      </h2>
      <div className="flex flex-col gap-3">
        {attentionItems.map((item) => (
          <div 
            key={item.id} 
            className="flex items-start gap-4 p-4 rounded-xl border"
            style={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderColor: item.needsReview ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.1)' 
            }}
          >
            <div className={`p-2 rounded-full mt-1 ${item.needsReview ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
              {item.needsReview ? <AlertCircle size={16} /> : <Clock size={16} />}
            </div>
            
            <div className="flex-1">
              <h3 className="font-semibold text-white text-base">{item.title}</h3>
              <p className="text-sm text-gray-400 mt-1">
                {item.date && isValid(parseISO(item.date))
                  ? format(parseISO(item.date), 'EEE, MMM d')
                  : 'No date'}
              </p>
              
              <div className="flex flex-wrap gap-2 mt-3">
                {item.strictDeadline && (
                  <span className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded border border-red-500/30">
                    Strict deadline
                  </span>
                )}
                {item.deadlineChange && item.deadlineChange !== 'none' && (
                  <span className="text-xs px-2 py-1 bg-orange-500/20 text-orange-300 rounded border border-orange-500/30">
                    Deadline {item.deadlineChange.replace('_', ' ')}
                  </span>
                )}
                {item.needsReview && (
                  <span className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded border border-red-500/30">
                    Needs human review
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
