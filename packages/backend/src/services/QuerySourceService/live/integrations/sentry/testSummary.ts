import { getSentryPaths } from '@lightdash/common';
import { z } from 'zod';
import { formatTestCount } from '../../integration';
import { type LiveHttpRequest, type LiveTestSummary } from '../../types';
import { toRawQuery } from './run';

type SentrySettings = { organizationSlug: string; projectSlugs: string[] };

const TEST_FIELD = 'count()';

/**
 * The setup test: a count of the error events of the source's projects over
 * a day. It names each project, so Sentry refuses one the token can't read,
 * and its answer holds a number and nothing of another project.
 */
export const getSentryTestRequest = ({
    organizationSlug,
    projectSlugs,
}: SentrySettings): LiveHttpRequest => ({
    method: 'GET',
    path: getSentryPaths(organizationSlug).events,
    rawQuery: toRawQuery([
        ['dataset', 'errors'],
        ['field', TEST_FIELD],
        ['statsPeriod', '24h'],
        ...projectSlugs.map((slug): [string, string] => ['project', slug]),
    ]),
    body: undefined,
});

const testResponseSchema = z.object({
    data: z.array(z.record(z.string(), z.unknown())),
});

export const summarizeSentryTest = (
    body: unknown,
    { organizationSlug, projectSlugs }: SentrySettings,
): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    const count = Number(parsed.data.data[0]?.[TEST_FIELD] ?? 0);
    return {
        summary: `The token reaches the Sentry organization ${organizationSlug}.`,
        facts: [
            { label: 'Projects', value: projectSlugs.join(', ') },
            {
                label: 'Error events in the last 24 hours',
                value: formatTestCount(Number.isFinite(count) ? count : 0),
            },
        ],
    };
};
