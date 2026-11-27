import { z } from 'zod';
import { formatTestCount, type LiveTestSummary } from '../../sdk';

// The setup test lists the workspace's users
const testResponseSchema = z.object({ data: z.array(z.unknown()) });

export const summarizePylonTest = (body: unknown): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    return {
        summary: 'Connected to your Pylon workspace',
        facts: [
            {
                label: 'Workspace users',
                value: formatTestCount(parsed.data.data.length),
            },
        ],
    };
};
