import {
    ApiConnectorType,
    DimensionType,
    HYDRA_REPORT_PATH,
} from '@lightdash/common';
import { z } from 'zod';
import { assertMaxRows } from '../../integration';
import { type LiveRunArgs, type LiveRunResult } from '../../types';
import { HYDRA_REPORTS, type HydraReportRequest } from './report';

/** The most rows one query returns, kept small so tests reach it. */
export const HYDRA_MAX_QUERY_ROWS = 500;

const responseSchema = z.object({
    rows: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
    totalRows: z.number(),
    nextOffset: z.number().nullable(),
});

type HydraRow = z.infer<typeof responseSchema>['rows'][number];

/**
 * Runs one Hydra report, asking for one row more than the limit, a page at
 * a time when the source pages. A page the API refuses is retried by the
 * rate-limit gate, so the pages before it are kept.
 */
export const runHydraQuery = async ({
    request,
    limit,
    calls,
}: LiveRunArgs<
    ApiConnectorType.HYDRA,
    HydraReportRequest
>): Promise<LiveRunResult> => {
    assertMaxRows(limit, HYDRA_MAX_QUERY_ROWS);
    const rowLimit = Math.min(limit, request.limit ?? limit);
    const rows: HydraRow[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
        // eslint-disable-next-line no-await-in-loop
        const page: z.infer<typeof responseSchema> = await calls.fetch(
            {
                method: 'POST',
                path: HYDRA_REPORT_PATH,
                body: { ...request, limit: rowLimit + 1, offset },
            },
            responseSchema,
        );
        rows.push(...page.rows);
        offset = page.nextOffset;
    }
    const dates: readonly string[] = HYDRA_REPORTS[request.report].dates;
    return {
        columns: [
            ...request.dimensions.map((name) => ({
                name,
                type: dates.includes(name)
                    ? DimensionType.DATE
                    : DimensionType.STRING,
            })),
            ...request.metrics.map((name) => ({
                name,
                type: DimensionType.NUMBER,
            })),
        ],
        rows: rows.slice(0, rowLimit),
        hasMoreRows: rows.length > rowLimit,
    };
};
