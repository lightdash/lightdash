import { z } from 'zod';
import { formatTestCount } from '../../integration';
import { type LiveTestSummary } from '../../types';

// The setup test lists one App Store version with its total
const testResponseSchema = z.object({
    data: z.array(
        z.object({
            attributes: z
                .object({
                    versionString: z.string().optional(),
                    appVersionState: z.string().optional(),
                })
                .optional(),
        }),
    ),
    meta: z.object({ paging: z.object({ total: z.number() }) }),
});

export const summarizeAppStoreConnectTest = (
    body: unknown,
    { appId }: { appId: string },
): LiveTestSummary | null => {
    const parsed = testResponseSchema.safeParse(body);
    if (!parsed.success) return null;
    const latest = parsed.data.data[0]?.attributes;
    return {
        summary: `Connected to app ${appId}`,
        facts: [
            {
                label: 'App Store versions',
                value: formatTestCount(parsed.data.meta.paging.total),
            },
            ...(latest?.versionString
                ? [
                      {
                          label: 'Latest version',
                          value: `${latest.versionString} (${latest.appVersionState ?? 'unknown'})`,
                      },
                  ]
                : []),
        ],
    };
};
