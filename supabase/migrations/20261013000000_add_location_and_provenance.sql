-- NoticeSync Location & Provenance Tracking Migration
-- Date: 2026-10-13
-- Description:
-- 1. Adds location column to academic_events for room, lab, and venue metadata.
-- 2. Adds page_number and chunk_index to academic_events to maintain persistent source document provenance links.

ALTER TABLE public.academic_events
  ADD COLUMN IF NOT EXISTS location TEXT;

ALTER TABLE public.academic_events
  ADD COLUMN IF NOT EXISTS page_number INTEGER;

ALTER TABLE public.academic_events
  ADD COLUMN IF NOT EXISTS chunk_index INTEGER;
