import { z } from 'zod';
import { formatTestCount } from '../../integration';
import { type LiveTestSummary } from '../../types';

// The setup test lists the object's properties
const testResponseSchema = z.object({ results: z.array(z.unknown()) });

/** The setup test reads the deals' properties, the source's main explore. */
export const summarizeHubspotTest = (body: unknown): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    return {
        summary: 'Connected to your HubSpot account',
        facts: [
            {
                label: 'Deal properties',
                value: formatTestCount(parsed.data.results.length),
            },
        ],
    };
};
