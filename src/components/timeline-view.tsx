'use client';

import type { AcademicEvent } from '@/lib/types';
import { groupEventsByDate, formatEventDate, getRelativeLabel } from '@/lib/dates';
import EventCard from './event-card';

interface TimelineViewProps {
  events: AcademicEvent[];
}

export default function TimelineView({ events }: TimelineViewProps) {
  const grouped = groupEventsByDate(events);

  if (grouped.size === 0) {
    return (
      <div className="card p-8 text-center animate-fade-in-up">
        <p style={{ color: 'var(--text-secondary)' }}>No events in the timeline yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <h2 className="text-lg font-semibold">Timeline</h2>
      {Array.from(grouped.entries()).map(([date, dateEvents]) => {
        const relative = getRelativeLabel(date);
        const formatted = formatEventDate(date);

        return (
          <div key={date}>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                {formatted}
              </h3>
              {relative && (
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor:
                      relative === 'Today'
                        ? 'rgba(34,197,94,0.1)'
                        : relative === 'Tomorrow'
                          ? 'rgba(245,158,11,0.1)'
                          : 'rgba(79,125,245,0.05)',
                    color:
                      relative === 'Today'
                        ? 'var(--accent-green)'
                        : relative === 'Tomorrow'
                          ? 'var(--accent-orange)'
                          : 'var(--text-muted)',
                  }}
                >
                  {relative}
                </span>
              )}
            </div>
            <div className="space-y-2 ml-0 sm:ml-4 border-l-2 pl-4" style={{ borderColor: 'var(--border-subtle)' }}>
              {dateEvents.map((evt) => (
                <EventCard key={evt.id} event={evt} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
