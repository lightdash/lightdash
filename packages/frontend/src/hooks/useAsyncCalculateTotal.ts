import {
    buildPivotRowTotalKey,
    QueryHistoryStatus,
    type ApiError,
    type ApiExecuteAsyncMetricQueryResults,
    type CalculateTotalKind,
    type PivotRowTotalsByIndex,
    type RawResultRow,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { pollForResults } from '../features/queryRunner/executeQuery';
import { getResultsFromStream } from '../utils/request';

type StartCalculateTotalArgs = {
    projectUuid: string;
    sourceQueryUuid: string;
    kind: CalculateTotalKind;
    invalidateCache?: boolean;
};

const startCalculateTotalQuery = ({
    projectUuid,
    sourceQueryUuid,
    kind,
    invalidateCache,
}: StartCalculateTotalArgs) =>
    lightdashApi<ApiExecuteAsyncMetricQueryResults>({
        url: `/projects/${projectUuid}/query/${sourceQueryUuid}/calculate-total`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify({
            kind,
            invalidateCache,
        }),
    });

// Single wide row of totals. Keys are pivoted SQL column names for pivoted
// sources, plain metric field ids otherwise.
export type AsyncTotalsMap = Record<string, number>;

const fetchTotals = async (
    args: Omit<StartCalculateTotalArgs, 'kind'>,
): Promise<AsyncTotalsMap> => {
    const { queryUuid } = await startCalculateTotalQuery({
        ...args,
        kind: 'columnTotal',
    });

    // Polling endpoint defaults to page=1, so the READY response already
    // contains the single totals row — no separate stream fetch needed.
    const query = await pollForResults(args.projectUuid, queryUuid);

    if (
        query.status === QueryHistoryStatus.ERROR ||
        query.status === QueryHistoryStatus.EXPIRED
    ) {
        throw new Error(query.error || 'Error computing totals');
    }
    if (query.status !== QueryHistoryStatus.READY) {
        throw new Error('Unexpected query status while polling totals');
    }

    const firstRow = query.rows[0];
    if (!firstRow) return {};

    // Flatten ResultRow cells (`{ value: { raw } }`) back to `{ key: raw }`.
    const flat: Record<string, unknown> = {};
    for (const [key, cell] of Object.entries(firstRow)) {
        flat[key] = cell?.value?.raw;
    }
    return flat as AsyncTotalsMap;
};

export const useAsyncCalculateTotal = ({
    projectUuid,
    sourceQueryUuid,
    enabled,
    invalidateCache,
}: {
    projectUuid: string | undefined;
    sourceQueryUuid: string | undefined;
    enabled: boolean;
    invalidateCache?: boolean;
}) =>
    useQuery<AsyncTotalsMap, ApiError>({
        queryKey: [
            'calculate_async_total',
            projectUuid,
            sourceQueryUuid,
            invalidateCache,
        ],
        queryFn: () => {
            if (!projectUuid || !sourceQueryUuid) {
                return Promise.reject(
                    new Error(
                        'Missing projectUuid or sourceQueryUuid for async totals',
                    ),
                );
            }
            return fetchTotals({
                projectUuid,
                sourceQueryUuid,
                invalidateCache,
            });
        },
        enabled: enabled && !!projectUuid && !!sourceQueryUuid,
        retry: false,
    });

// Row totals re-run the source query collapsed across the pivot columns, so the
// result is one flat row per index-value combination (index dims + metrics),
// not the single wide row column totals return. We stream every row and key it
// by the index-dim values so the pivot worker can match each rendered row.
const fetchRowTotals = async (
    args: Omit<StartCalculateTotalArgs, 'kind'> & {
        indexFieldIds: string[];
    },
): Promise<PivotRowTotalsByIndex> => {
    const { projectUuid, sourceQueryUuid, indexFieldIds, invalidateCache } =
        args;
    const { queryUuid } = await startCalculateTotalQuery({
        projectUuid,
        sourceQueryUuid,
        kind: 'rowTotal',
        invalidateCache,
    });

    const query = await pollForResults(projectUuid, queryUuid);

    if (
        query.status === QueryHistoryStatus.ERROR ||
        query.status === QueryHistoryStatus.EXPIRED
    ) {
        throw new Error(query.error || 'Error computing totals');
    }
    if (query.status !== QueryHistoryStatus.READY) {
        throw new Error('Unexpected query status while polling totals');
    }

    // One row per index combination — potentially more than a single page, so
    // read the whole results file rather than the paginated poll response.
    const fileUrl = `/api/v2/projects/${projectUuid}/query/${queryUuid}/results`;
    const rows = await getResultsFromStream<RawResultRow>(fileUrl);

    const indexFieldIdSet = new Set(indexFieldIds);
    const map: PivotRowTotalsByIndex = {};
    for (const row of rows) {
        const key = buildPivotRowTotalKey(
            indexFieldIds.map((fieldId) => [fieldId, row[fieldId]]),
        );
        const metricTotals: Record<string, number> = {};
        for (const [fieldId, raw] of Object.entries(row)) {
            if (indexFieldIdSet.has(fieldId)) continue;
            const numeric = Number(raw);
            if (Number.isFinite(numeric)) {
                metricTotals[fieldId] = numeric;
            }
        }
        map[key] = metricTotals;
    }
    return map;
};

export const useAsyncCalculateRowTotal = ({
    projectUuid,
    sourceQueryUuid,
    indexFieldIds,
    enabled,
    invalidateCache,
}: {
    projectUuid: string | undefined;
    sourceQueryUuid: string | undefined;
    indexFieldIds: string[];
    enabled: boolean;
    invalidateCache?: boolean;
}) =>
    useQuery<PivotRowTotalsByIndex, ApiError>({
        queryKey: [
            'calculate_async_row_total',
            projectUuid,
            sourceQueryUuid,
            indexFieldIds,
            invalidateCache,
        ],
        queryFn: () => {
            if (!projectUuid || !sourceQueryUuid) {
                return Promise.reject(
                    new Error(
                        'Missing projectUuid or sourceQueryUuid for async row totals',
                    ),
                );
            }
            return fetchRowTotals({
                projectUuid,
                sourceQueryUuid,
                indexFieldIds,
                invalidateCache,
            });
        },
        enabled:
            enabled &&
            !!projectUuid &&
            !!sourceQueryUuid &&
            indexFieldIds.length > 0,
        retry: false,
    });
