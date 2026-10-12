'use client';

import { useState } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  Edit3,
  Save,
  X,
} from 'lucide-react';
import type { AcademicEvent, EventType } from '@/lib/types';
import EventCard from './event-card';

interface ReviewEventProps {
  events: AcademicEvent[];
  onConfirm: (events: AcademicEvent[]) => void;
}

export default function ReviewEvent({ events, onConfirm }: ReviewEventProps) {
  const [editableEvents, setEditableEvents] = useState<AcademicEvent[]>(events);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<AcademicEvent>>({});

  const reviewCount = editableEvents.filter((e) => e.needsReview).length;
  const confirmedCount = editableEvents.filter((e) => !e.needsReview).length;

  const handleDelete = (id: string) => {
    setEditableEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const handleEdit = (event: AcademicEvent) => {
    setEditingId(event.id);
    setEditForm({
      title: event.title,
      date: event.date,
      type: event.type,
      location: event.location,
      description: event.description,
    });
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    setEditableEvents((prev) =>
      prev.map((e) =>
        e.id === editingId
          ? {
              ...e,
              title: editForm.title || e.title,
              date: editForm.date || e.date,
              type: editForm.type || e.type,
              location: editForm.location !== undefined ? editForm.location : e.location,
              description: editForm.description || e.description,
              needsReview: false,
              confidence: Math.max(e.confidence, 80),
            }
          : e
      )
    );
    setEditingId(null);
    setEditForm({});
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Summary */}
      <div className="card p-5">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <CheckCircle size={20} style={{ color: 'var(--accent-green)' }} />
          Review Extracted Events
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Gemma found {editableEvents.length} event{editableEvents.length !== 1 ? 's' : ''}.
          {reviewCount > 0 && (
            <span style={{ color: 'var(--accent-orange)' }}>
              {' '}{reviewCount} need{reviewCount !== 1 ? '' : 's'} your review.
            </span>
          )}
          {' '}Confirm, edit, or remove events before adding them to your planner.
        </p>

        <div className="flex gap-3 text-xs font-medium">
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: 'var(--accent-green)' }}>
            <CheckCircle size={14} /> {confirmedCount} confirmed
          </span>
          {reviewCount > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: 'var(--accent-orange)' }}>
              <AlertTriangle size={14} /> {reviewCount} needs review
            </span>
          )}
        </div>
      </div>

      {/* Event list */}
      <div className="space-y-3">
        {editableEvents.map((event) =>
          editingId === event.id ? (
            <div key={event.id} className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Edit3 size={16} style={{ color: 'var(--accent-blue)' }} />
                  Edit Event
                </h4>
                <button onClick={() => setEditingId(null)} className="p-1 rounded-md hover:bg-white/5">
                  <X size={16} style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>

              <input
                type="text"
                value={editForm.title || ''}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full rounded-lg p-2.5 text-sm border"
                style={{ backgroundColor: 'var(--bg-card-hover)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                placeholder="Event title"
              />
              <div className="flex gap-3">
                <input
                  type="date"
                  value={editForm.date || ''}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="flex-1 rounded-lg p-2.5 text-sm border"
                  style={{ backgroundColor: 'var(--bg-card-hover)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
                <select
                  value={editForm.type || 'Notice'}
                  onChange={(e) => setEditForm({ ...editForm, type: e.target.value as EventType })}
                  className="flex-1 rounded-lg p-2.5 text-sm border"
                  style={{ backgroundColor: 'var(--bg-card-hover)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                >
                  <option value="Exam">Exam</option>
                  <option value="Assignment">Assignment</option>
                  <option value="Notice">Notice</option>
                </select>
              </div>
              <input
                type="text"
                value={editForm.location || ''}
                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                className="w-full rounded-lg p-2.5 text-sm border"
                style={{ backgroundColor: 'var(--bg-card-hover)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                placeholder="Venue / Room / Hall (optional)"
              />
              <textarea
                value={editForm.description || ''}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full rounded-lg p-2.5 text-sm border resize-none"
                style={{ backgroundColor: 'var(--bg-card-hover)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                rows={2}
                placeholder="Description (optional)"
              />
              <button
                onClick={handleSaveEdit}
                className="w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--accent-blue)', color: '#fff' }}
              >
                <Save size={16} /> Save Changes
              </button>
            </div>
          ) : (
            <EventCard
              key={event.id}
              event={event}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )
        )}
      </div>

      {/* Confirm all button */}
      {editableEvents.length > 0 && (
        <button
          onClick={() => onConfirm(editableEvents)}
          className="w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          style={{ backgroundColor: 'var(--accent-green)', color: '#fff' }}
        >
          <CheckCircle size={18} />
          Confirm {editableEvents.length} Event{editableEvents.length !== 1 ? 's' : ''} & Open Planner
        </button>
      )}
    </div>
  );
}
