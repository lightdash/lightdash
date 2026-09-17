import type { AiThreadCreatedFrom } from '@lightdash/common';
import { DATA_APP_INVESTIGATE_TOOL_NAMES } from '../ai/agents/agentV2';

/**
 * A thread that began as a data-app investigation keeps the investigation's
 * read-only tool set for every later prompt, whatever the caller asked for.
 * Viewers can keep asking questions; they cannot save, change or reach out.
 */
export const resolveStandardToolAllowlist = (
    threadCreatedFrom: AiThreadCreatedFrom,
    requested: ReadonlySet<string> | undefined,
): ReadonlySet<string> | undefined =>
    threadCreatedFrom === 'data_app'
        ? DATA_APP_INVESTIGATE_TOOL_NAMES
        : requested;
