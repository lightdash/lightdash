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
});

/** Runs one Hydra report, asking for one row more than the limit. */
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
    const { rows } = await calls.fetch(
        {
            method: 'POST',
            path: HYDRA_REPORT_PATH,
            body: { ...request, limit: rowLimit + 1 },
        },
        responseSchema,
    );
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
