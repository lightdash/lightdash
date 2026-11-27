import { z } from 'zod';
import { formatTestCount, type LiveTestSummary } from '../../sdk';

// The setup test searches the repository's pull requests
const testResponseSchema = z.object({ total_count: z.number() });

export const summarizeGithubTest = (
    body: unknown,
    { owner, repo }: { owner: string; repo: string },
): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    return {
        summary: `Connected to ${owner}/${repo}`,
        facts: [
            {
                label: 'Pull requests',
                value: formatTestCount(parsed.data.total_count),
            },
        ],
    };
};
