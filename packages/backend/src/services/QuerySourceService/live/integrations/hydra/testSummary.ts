import { z } from 'zod';
import { formatTestCount, type LiveTestSummary } from '../../sdk';

// The setup test reads the account the token's rows belong to
const testResponseSchema = z.object({
    account: z.string(),
    events: z.number(),
    users: z.number(),
});

export const summarizeHydraTest = (body: unknown): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    return {
        summary: `Connected to Hydra account ${parsed.data.account}`,
        facts: [
            { label: 'Events', value: formatTestCount(parsed.data.events) },
            { label: 'Users', value: formatTestCount(parsed.data.users) },
        ],
    };
};
