// Organizations created on or after this date get AI without the AI copilot
// flag, as a trial with no end date.
export const AI_TRIAL_START_DATE = new Date('2025-10-13T00:00:00Z');

export const isCreatedInAiTrial = (createdAt: Date): boolean =>
    createdAt >= AI_TRIAL_START_DATE;
