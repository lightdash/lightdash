import { z } from 'zod';
import { formatTestCount } from '../../integration';
import { type LiveTestSummary } from '../../types';

// The setup test lists the object's properties
const testResponseSchema = z.object({ results: z.array(z.unknown()) });

export const summarizeHubspotTest = (
    body: unknown,
    { object }: { object: string },
): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    return {
        summary: `Connected to your HubSpot ${object}`,
        facts: [
            {
                label: 'Properties',
                value: formatTestCount(parsed.data.results.length),
            },
        ],
    };
};
