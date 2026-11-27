import { z } from 'zod';
import { formatTestCount, type LiveTestSummary } from '../../sdk';

// Answer to POSTHOG_TEST_QUERY: one row, one count
const testResponseSchema = z.object({
    results: z.tuple([z.tuple([z.number()])]),
});

export const summarizePostHogTest = (
    body: unknown,
    { projectId }: { projectId: string },
): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    const [[eventTypes]] = parsed.data.results;
    return {
        summary: `Connected to PostHog project ${projectId}`,
        facts: [
            {
                label: 'Event types in the last 7 days',
                value: formatTestCount(eventTypes),
            },
        ],
    };
};
