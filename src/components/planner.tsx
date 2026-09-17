'use client';

import { useState } from 'react';
import {
  Calendar,
  CalendarDays,
  TrendingUp,
  Download,
  Plus,
  Database
} from 'lucide-react';
import type { AcademicEvent } from '@/lib/types';
import { generateIcsString, downloadIcsFile } from '@/lib/calendar';
import TodayView from './today-view';
import TimelineView from './timeline-view';
import WorkloadView from './workload-view';
import AcademicBrief from './academic-brief';
import AttentionView from './attention-view';
import AskNoticeSync from './ask-noticesync';
import AcademicMemoryView from './academic-memory-view';

interface PlannerProps {
  events: AcademicEvent[];
  onAddMore: () => void;
}

type PlannerTab = 'today' | 'timeline' | 'workload' | 'memory';

export default function Planner({ events, onAddMore }: PlannerProps) {
  const [activeTab, setActiveTab] = useState<PlannerTab>('today');

  const tabs: { id: PlannerTab; label: string; icon: React.ReactNode }[] = [
    { id: 'today', label: 'Today', icon: <Calendar size={18} /> },
    { id: 'timeline', label: 'Timeline', icon: <CalendarDays size={18} /> },
    { id: 'workload', label: 'Workload', icon: <TrendingUp size={18} /> },
    { id: 'memory', label: 'Memory', icon: <Database size={18} /> },
  ];

  const handleExport = () => {
    try {
      // Exclude events that need review or don't have a strict date
      const confirmedEvents = events.filter((e) => !e.needsReview && e.date !== null);
      if (confirmedEvents.length === 0) {
        alert('No confirmed events with exact dates to export. Please review and confirm events first.');
        return;
      }
      const icsContent = generateIcsString(confirmedEvents);
      downloadIcsFile(icsContent);
    } catch {
      alert('Failed to generate calendar file. Please try again.');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Your Academic Plan</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {events.length} event{events.length !== 1 ? 's' : ''} synced
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onAddMore}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors border"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            <Plus size={16} /> Add more
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            style={{ backgroundColor: 'var(--accent-blue)', color: '#fff' }}
          >
            <Download size={16} /> Export .ics
          </button>
        </div>
      </div>

      <AttentionView events={events} />

      {/* AI Insight */}
      <AcademicBrief events={events} />

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-2 py-3 px-5 text-sm font-medium transition-colors"
            style={{
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom:
                activeTab === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
            }}
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'today' && <TodayView events={events} />}
      {activeTab === 'timeline' && <TimelineView events={events} />}
      {activeTab === 'workload' && <WorkloadView events={events} />}
      {activeTab === 'memory' && <AcademicMemoryView />}

      {/* RAG Chat Assistant */}
      <AskNoticeSync />
    </div>
  );
}
