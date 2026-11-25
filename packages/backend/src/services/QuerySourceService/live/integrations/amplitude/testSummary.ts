import { z } from 'zod';
import { formatTestCount } from '../../integration';
import { type LiveTestSummary } from '../../types';

// The setup test lists the project's events, with this week's totals
const testResponseSchema = z.object({
    data: z.array(z.object({ value: z.string().optional() }).passthrough()),
});

export const summarizeAmplitudeTest = (
    body: unknown,
): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    return {
        summary: 'Connected to your Amplitude project',
        facts: [
            {
                label: 'Tracked events',
                value: formatTestCount(parsed.data.data.length),
            },
        ],
    };
};
