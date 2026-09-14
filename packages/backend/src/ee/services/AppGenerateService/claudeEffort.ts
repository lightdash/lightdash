import {
    DATA_APP_VIZ_TEMPLATE,
    type AppGeneratePipelineJobPayload,
    type DataAppClaudeEffort,
    type DataAppTemplate,
} from '@lightdash/common';

/**
 * Reasoning-effort policy for the claude CLI: first builds run low —
 * benchmarked ~40% faster with no quality-gate regressions — while
 * iterations run high (the CLI default, now passed explicitly), since
 * they make targeted edits to existing code where deeper reasoning
 * matters more than blank-page latency.
 *
 * Chart types are the exception — a single small declaration file, where
 * high effort cost minutes on trivial edits and bought nothing back.
 */
export const resolveClaudeEffort = (
    version: number,
    template: DataAppTemplate | null,
): DataAppClaudeEffort => {
    if (template === DATA_APP_VIZ_TEMPLATE) return 'low';
    return version === 1 ? 'low' : 'high';
};

/** The effort a job runs at: what the enqueuer decided, or the policy
 *  applied to the app's own template for jobs that predate the field. */
export const payloadClaudeEffort = (
    payload: AppGeneratePipelineJobPayload,
    template: DataAppTemplate | null,
): DataAppClaudeEffort =>
    payload.claudeEffort ?? resolveClaudeEffort(payload.version, template);

/**
 * Same value for paths holding only the payload. Only a generate payload
 * carries `template`, so the pre-field fallback has to fetch it — lazily,
 * since a job that names its own effort never needs the lookup.
 */
export const jobClaudeEffort = async (
    payload: AppGeneratePipelineJobPayload,
    getTemplate: () => Promise<DataAppTemplate | null>,
): Promise<DataAppClaudeEffort> => {
    if (payload.claudeEffort) return payload.claudeEffort;
    return payloadClaudeEffort(payload, await getTemplate());
};
