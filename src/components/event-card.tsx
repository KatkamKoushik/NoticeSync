'use client';

import { useState } from 'react';
import {
  BookOpen,
  GraduationCap,
  Bell,
  AlertTriangle,
  Clock,
  Info,
  MapPin,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { AcademicEvent } from '@/lib/types';
import { formatEventDate, getRelativeLabel } from '@/lib/dates';

interface EventCardProps {
  event: AcademicEvent;
  onEdit?: (event: AcademicEvent) => void;
  onDelete?: (id: string) => void;
  compact?: boolean;
}

const typeConfig: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  Exam: {
    icon: <GraduationCap size={16} />,
    color: 'var(--accent-red)',
    bg: 'rgba(239,68,68,0.1)',
  },
  Assignment: {
    icon: <BookOpen size={16} />,
    color: 'var(--accent-blue)',
    bg: 'rgba(79,125,245,0.1)',
  },
  Notice: {
    icon: <Bell size={16} />,
    color: 'var(--accent-orange)',
    bg: 'rgba(245,158,11,0.1)',
  },
};

export default function EventCard({ event, onEdit, onDelete, compact }: EventCardProps) {
  const [showWhy, setShowWhy] = useState(false);
  const config = typeConfig[event.type] || typeConfig.Notice;
  const relative = getRelativeLabel(event.date);
  const formattedDate = formatEventDate(event.date);

  const confidenceLevel =
    event.confidence >= 90
      ? 'high'
      : event.confidence >= 70
        ? 'medium'
        : 'low';

  return (
    <div
      className="card p-4 flex flex-col gap-3 animate-fade-in-up"
      style={{
        borderLeftWidth: '3px',
        borderLeftColor: config.color,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 p-1.5 rounded-md"
            style={{ backgroundColor: config.bg, color: config.color }}
          >
            {config.icon}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm leading-tight truncate">{event.title}</h3>
            {event.course && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {event.course}
              </p>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {formattedDate}
          </p>
          {relative && (
            <p
              className="text-xs font-medium"
              style={{
                color:
                  relative === 'Today'
                    ? 'var(--accent-green)'
                    : relative === 'Tomorrow'
                      ? 'var(--accent-orange)'
                      : 'var(--text-muted)',
              }}
            >
              {relative}
            </p>
          )}
        </div>
      </div>

      {/* Constraints & Indicators */}
      <div className="flex flex-wrap gap-2">
        {event.strictDeadline && (
          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 bg-red-500/10 text-red-500 font-medium">
             <AlertTriangle size={12} /> Strict deadline
          </span>
        )}
        {event.importance === 'high' && !event.strictDeadline && (
          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 bg-red-500/10 text-red-500 font-medium">
             <AlertTriangle size={12} /> High importance
          </span>
        )}
        {event.deadlineChange !== 'none' && event.deadlineChange !== 'unknown' && (
          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 bg-orange-500/10 text-orange-500 font-medium capitalize">
             <Clock size={12} /> Deadline {event.deadlineChange.replace('_', ' ')}
          </span>
        )}
        {event.additionalInformationPending && (
          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 bg-yellow-500/10 text-yellow-500 font-medium">
             <Info size={12} /> More info pending
          </span>
        )}
        {event.location && (
          <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 bg-blue-500/10 text-blue-400 font-medium">
             <MapPin size={12} /> {event.location}
          </span>
        )}
      </div>

      {/* Review Reason / Conflict Banner */}
      {event.reviewReason && (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-400" />
          <div>
            <span className="font-semibold text-amber-200">Attention:</span> {event.reviewReason}
          </div>
        </div>
      )}

      {/* Description */}
      {!compact && event.description && (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {event.description}
        </p>
      )}

      {/* Confidence + Review badge */}
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: config.bg,
              color: config.color,
            }}
          >
            {event.type}
          </span>
          {event.needsReview && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{
                backgroundColor: 'rgba(245,158,11,0.1)',
                color: 'var(--accent-orange)',
              }}
            >
              <AlertTriangle size={12} />
              Needs review
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {(event.sourceExcerpt || event.sourceText) && (
            <button
              onClick={() => setShowWhy(!showWhy)}
              className="text-xs font-medium px-2 py-1 rounded-md transition-colors flex items-center gap-1 bg-white/5 hover:bg-white/10"
              style={{ color: 'var(--text-muted)' }}
            >
              Evidence
              {showWhy ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}

          {/* Confidence indicator */}
          <span
            className="text-xs font-medium"
            style={{
              color:
                confidenceLevel === 'high'
                  ? 'var(--accent-green)'
                  : confidenceLevel === 'medium'
                    ? 'var(--accent-orange)'
                    : 'var(--accent-red)',
            }}
          >
            {event.confidence}%
          </span>
        </div>
      </div>

      {/* Why & Source Evidence Section */}
      {showWhy && (event.sourceExcerpt || event.sourceText) && (
        <div className="mt-2 p-3 rounded-md bg-white/5 border border-white/10 text-xs text-gray-300 space-y-1.5">
          <div className="font-semibold text-gray-200 flex items-center justify-between">
            <span>Verified Source Evidence</span>
            {event.pageNumber && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono">
                Page {event.pageNumber}
              </span>
            )}
            {event.chunkIndex !== undefined && !event.pageNumber && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono">
                Chunk {event.chunkIndex}
              </span>
            )}
          </div>
          <p className="italic text-gray-400">&ldquo;{event.sourceExcerpt || event.sourceText}&rdquo;</p>
          {event.documentTitle && (
            <p className="text-[11px] text-gray-500">Document: {event.documentTitle}</p>
          )}
        </div>
      )}

      {/* Actions (for review) */}
      {onEdit && onDelete && (
        <div className="flex gap-2 pt-3 border-t mt-1" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            onClick={() => onEdit(event)}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-white/5 flex-1"
            style={{ color: 'var(--accent-blue)' }}
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(event.id)}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-white/5 flex-1"
            style={{ color: 'var(--accent-red)' }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
