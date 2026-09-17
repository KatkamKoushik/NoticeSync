'use client';

import { PartyPopper, ArrowRight, AlertCircle } from 'lucide-react';
import type { AcademicEvent } from '@/lib/types';
import { getTodayEvents, getNextUpcomingEvent, getPendingEvents } from '@/lib/dates';
import EventCard from './event-card';

interface TodayViewProps {
  events: AcademicEvent[];
}

export default function TodayView({ events }: TodayViewProps) {
  const todayEvents = getTodayEvents(events);
  const nextEvent = getNextUpcomingEvent(events);
  const pendingEvents = getPendingEvents(events);

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Needs Attention / Pending */}
      {pendingEvents.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-yellow-500">
            <AlertCircle size={16} /> Requires Attention
          </h2>
          {pendingEvents.map((evt) => (
            <EventCard key={evt.id} event={evt} compact />
          ))}
        </div>
      )}

      {/* Today */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Today</h2>
        {todayEvents.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium" style={{ color: 'var(--accent-blue)' }}>
              {todayEvents.length} event{todayEvents.length !== 1 ? 's' : ''} today
            </p>
            {todayEvents.map((evt) => (
              <EventCard key={evt.id} event={evt} compact />
            ))}
          </div>
        ) : (
          <div className="card p-8 text-center border-dashed">
            <PartyPopper
              size={40}
              className="mx-auto mb-3"
              style={{ color: 'var(--accent-green)' }}
            />
            <h3 className="font-semibold text-lg mb-1">You&apos;re clear today 🎉</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No academic events scheduled for today.
            </p>
          </div>
        )}
      </div>

      {/* Next upcoming */}
      {nextEvent && (
        <div className="card p-4 border-dashed">
          <p className="text-xs font-medium mb-3 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <ArrowRight size={14} /> Next up
          </p>
          <EventCard event={nextEvent} compact />
        </div>
      )}
    </div>
  );
}
