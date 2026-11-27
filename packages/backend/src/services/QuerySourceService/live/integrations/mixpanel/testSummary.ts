import { z } from 'zod';
import { formatTestCount, type LiveTestSummary } from '../../sdk';

// The setup test lists the project's most common events of the last 31 days
const testResponseSchema = z.array(z.string());

export const summarizeMixpanelTest = (
    body: unknown,
): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    return {
        summary: 'Connected to your Mixpanel project',
        facts: [
            {
                label: 'Events in the last 31 days',
                value: formatTestCount(parsed.data.length),
            },
        ],
    };
};
