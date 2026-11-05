import type { AiThreadCreatedFrom } from '@lightdash/common';
import { DATA_APP_INVESTIGATE_TOOL_NAMES } from '../ai/agents/agentV2';

/**
 * A thread that began as an AI-analysis investigation (of a data app or a
 * dashboard) keeps the investigation's read-only tool set for every later
 * prompt, whatever the caller asked for. Viewers can keep asking questions;
 * they cannot save, change or reach out.
 */
export const isAnalysisInvestigationThread = (
    threadCreatedFrom: AiThreadCreatedFrom,
): boolean =>
    threadCreatedFrom === 'data_app' ||
    threadCreatedFrom === 'dashboard_analysis';

/** Deep research builds its own tool set (raw SQL, trusted MCP), so it never runs on such a thread. */
export const canStartDeepResearch = (
    threadCreatedFrom: AiThreadCreatedFrom,
): boolean => !isAnalysisInvestigationThread(threadCreatedFrom);

export const resolveStandardToolAllowlist = (
    threadCreatedFrom: AiThreadCreatedFrom,
    requested: ReadonlySet<string> | undefined,
): ReadonlySet<string> | undefined =>
    isAnalysisInvestigationThread(threadCreatedFrom)
        ? DATA_APP_INVESTIGATE_TOOL_NAMES
        : requested;
