'use client';

import { AlertTriangle, TrendingUp, AlertCircle } from 'lucide-react';
import type { AcademicEvent } from '@/lib/types';
import { getWeeklyWorkload } from '@/lib/dates';

interface WorkloadViewProps {
  events: AcademicEvent[];
}

export default function WorkloadView({ events }: WorkloadViewProps) {
  const weeks = getWeeklyWorkload(events);

  if (weeks.length === 0) {
    return (
      <div className="card p-8 text-center animate-fade-in-up border-dashed">
        <p style={{ color: 'var(--text-secondary)' }}>Not enough events with exact dates to show workload.</p>
      </div>
    );
  }

  const maxCount = Math.max(...weeks.map((w) => w.count), 1);
  const heavyWeeks = weeks.filter((w) => w.isHeavy);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <TrendingUp size={20} style={{ color: 'var(--accent-blue)' }} />
        Workload
      </h2>

      {/* Heavy week alerts */}
      {heavyWeeks.map((week) => (
        <div
          key={week.weekStart}
          className="card p-4 flex items-start gap-3 border-l-4"
          style={{ borderLeftColor: 'var(--accent-orange)' }}
        >
          <AlertTriangle size={20} className="shrink-0 mt-0.5" style={{ color: 'var(--accent-orange)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--accent-orange)' }}>
              Heavy academic week detected
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {week.count} academic events during the week of {week.weekLabel}.
              {week.strictCount > 0 && ` Includes ${week.strictCount} strict deadline(s).`}
            </p>
          </div>
        </div>
      ))}

      {/* Bar chart */}
      <div className="card p-5 space-y-4">
        {weeks.map((week) => (
          <div key={week.weekStart} className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <span
                className="text-xs font-mono w-14 shrink-0 text-right"
                style={{ color: 'var(--text-muted)' }}
              >
                {week.weekLabel}
              </span>
              <div className="flex-1 h-8 rounded-md overflow-hidden relative" style={{ backgroundColor: 'var(--bg-card-hover)' }}>
                {/* Total Count Bar */}
                <div
                  className="absolute left-0 top-0 h-full rounded-md transition-all duration-500"
                  style={{
                    width: `${Math.max((week.count / maxCount) * 100, 8)}%`,
                    backgroundColor: week.isHeavy ? 'var(--accent-orange)' : 'var(--accent-blue)',
                    opacity: 0.2
                  }}
                />
                {/* High Importance Bar */}
                <div
                  className="absolute left-0 top-0 h-full rounded-md transition-all duration-500 z-10 flex items-center justify-end pr-2"
                  style={{
                    width: `${Math.max((week.highImportanceCount / maxCount) * 100, 0)}%`,
                    backgroundColor: week.isHeavy ? 'var(--accent-orange)' : 'var(--accent-blue)',
                  }}
                >
                </div>
                
                <div className="absolute inset-0 flex items-center px-3 z-20 pointer-events-none justify-between">
                  <span className="text-xs font-semibold text-white mix-blend-difference">{week.count} total</span>
                  {week.strictCount > 0 && (
                    <span className="text-xs font-bold text-red-400 flex items-center gap-1">
                      <AlertCircle size={10} /> {week.strictCount} strict
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        
        <div className="flex justify-between items-center text-xs text-gray-500 pt-2 border-t border-gray-800">
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-blue-500 opacity-20"></div> Total Events
           </div>
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-blue-500"></div> High Priority
           </div>
           <div className="flex items-center gap-2">
              <div className="text-red-400"><AlertCircle size={12}/></div> Strict Deadlines
           </div>
        </div>
      </div>
    </div>
  );
}
