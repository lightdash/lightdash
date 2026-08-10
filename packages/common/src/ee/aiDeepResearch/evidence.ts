import { type AiDeepResearchWorkerFindings } from './types';

/**
 * Bounds on the evidence pack handed to the finalizer. The pack is rebuilt
 * server-side from the run's own executions, so its size is a function of how
 * many queries ran — never of how long the research conversation grew.
 */
export const AI_DEEP_RESEARCH_EVIDENCE_MAX_QUERIES = 15;
export const AI_DEEP_RESEARCH_EVIDENCE_MAX_ROWS = 20;

type AiDeepResearchEvidenceQueryBase = {
    queryUuid: string;
    title: string;
    description: string;
    /** Rows the query returned, before any truncation for this pack. */
    rowCount: number;
    /** Up to AI_DEEP_RESEARCH_EVIDENCE_MAX_ROWS rows, as CSV. */
    rowsCsv: string;
    truncated: boolean;
};

/** One verified execution, with enough of its result to write findings from. */
export type AiDeepResearchEvidenceQuery =
    | (AiDeepResearchEvidenceQueryBase & {
          type: 'metric_query';
          dimensions: string[];
          metrics: string[];
          /** Whether the server can derive a chart for this execution. */
          chartable: boolean;
      })
    | (AiDeepResearchEvidenceQueryBase & {
          type: 'sql_query';
          columns: string[];
          /** Raw SQL evidence does not have a semantic chart definition. */
          chartable: false;
      });

/**
 * Everything the finalizer is allowed to write a report from: the question, the
 * executions this run actually made, and any packets its workers returned.
 */
export type AiDeepResearchEvidencePack = {
    question: string;
    queries: AiDeepResearchEvidenceQuery[];
    workerFindings: AiDeepResearchWorkerFindings[];
};

export const isAiDeepResearchEvidencePackEmpty = (
    pack: AiDeepResearchEvidencePack,
): boolean => pack.queries.length === 0 && pack.workerFindings.length === 0;
