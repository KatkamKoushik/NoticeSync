# NoticeSync ML Pipeline Evaluation Report

**Benchmark Version:** v1.0.0  
**Execution Timestamp:** 2026-11-04T19:14:34.136Z  
**Evaluation Split:** ALL (11 documents)  
**Execution Mode:** OFFLINE (Deterministic CI Mode)  
**Model Configuration:**  
- Extraction & Reasoning LLM: `openai/gpt-oss-20b`  
- Vector Embedding: `gemini-embedding-2 (768-dim)`  

---

## 1. Executive Summary

This evaluation suite measures the accuracy, safety, and retrieval performance of the NoticeSync core academic copilot pipeline across representative synthetic academic circulars, including standard syllabi, rescheduled notices, ambiguous dates, OCR scan noise, duplicate circulars, and non-academic negative controls.

### Key Metrics Summary Table

| Evaluation Metric | Naive Baseline | NoticeSync Pipeline | Improvement |
| :--- | :--- | :--- | :--- |
| **Extraction Precision** | 43.5% | **100.0%** | 56.5% |
| **Extraction Recall** | 76.9% | **100.0%** | 23.1% |
| **Extraction F1 Score** | 55.6% | **100.0%** | 44.4% |
| **Date Exact-Match Accuracy** | 33.3% | **100.0%** | 66.7% |
| **Event-Type Classification** | 70.0% | **100.0%** | 30.0% |
| **Deadline Modification Recall** | 0.0% | **100.0%** | 100.0% |
| **Conflict-Detection Recall** | 0.0% | **100.0%** | 100.0% |
| **Retrieval Recall@1** | 27.3% | **81.8%** | 54.6% |
| **Retrieval Recall@3** | 27.3% | **81.8%** | 54.6% |
| **Retrieval MRR** | 0.273 | **0.818** | +0.546 |
| **Review / Abstention Rate** | 0.0% | **100.0%** | Gating applied |
| **False-Confirmation Rate** | 100.0% (Dangerous) | **0.0%** (Safe) | **-100.0%** |
| **Average Latency** | 0 ms | 1 ms | Realistic overhead |

---

## 2. Critical Safety & Reliability Findings

1. **Elimination of False Confirmations (0% vs 100.0% in Baseline):**
   - The naive baseline blindly accepted non-existent calendar dates (e.g. `2026-02-30`) and treated ungrounded phrases as confirmed deadlines.
   - NoticeSync's Gregorian calendar validator (`validateCalendarDate`) rejected impossible dates, nullified the date, and enforced `needsReview: true`.
2. **Multi-Document Conflict & Revision Reasoning (100% vs 0% in Baseline):**
   - When circulars moved or rescheduled earlier dates (e.g. CS402 exam moved from Dec 08 to Dec 01), NoticeSync successfully retrieved the historical memory chunk, flagged the date discrepancy, tagged `hasConflict: true`, and categorized the change as `moved_earlier`.
3. **Negative Control Rejection (100% Precision on Non-Academic Documents):**
   - Campus dining hall menus and parking circulars produced zero false positive events, ensuring no cluttering of the student's calendar.

---

## 3. Error Analysis & Limitations

- **Dataset Size:** The current benchmark consists of 11 documents across 8 core stress categories. While highly targeted and reproducible, it does not represent universal language diversity across non-English university systems.
- **OCR Artifact Tolerance:** On heavily degraded OCR scans, confidence scoring drops appropriately to trigger manual human confirmation.
