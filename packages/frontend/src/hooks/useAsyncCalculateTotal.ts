import {
    buildPivotRowTotalKey,
    getSubtotalKey,
    QueryHistoryStatus,
    type ApiError,
    type ApiExecuteAsyncMetricQueryResults,
    type ApiGetAsyncQueryResults,
    type CalculateTotalKind,
    type PivotRowTotalsByIndex,
    type RawResultRow,
    type ResultRow,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { pollForResults } from '../features/queryRunner/executeQuery';

// Reads every page of a ready query from the paginated results endpoint.
const fetchAllResultRows = async (
    projectUuid: string,
    queryUuid: string,
): Promise<ResultRow[]> => {
    const rows: ResultRow[] = [];
    let page = 1;
    let totalPageCount = 1;
    do {
        const result = await lightdashApi<ApiGetAsyncQueryResults>({
            url: `/projects/${projectUuid}/query/${queryUuid}?page=${page}`,
            version: 'v2',
            method: 'GET',
            body: undefined,
        });
        if (result.status !== QueryHistoryStatus.READY) {
            throw new Error('Unexpected query status while reading results');
        }
        rows.push(...result.rows);
        totalPageCount = result.totalPageCount ?? 1;
        page += 1;
    } while (page <= totalPageCount);
    return rows;
};

type StartCalculateTotalArgs = {
    projectUuid: string;
    sourceQueryUuid: string;
    kind: CalculateTotalKind;
    subtotalDimensions?: string[];
    invalidateCache?: boolean;
};

const startCalculateTotalQuery = ({
    projectUuid,
    sourceQueryUuid,
    kind,
    subtotalDimensions,
    invalidateCache,
}: StartCalculateTotalArgs) =>
    lightdashApi<ApiExecuteAsyncMetricQueryResults>({
        url: `/projects/${projectUuid}/query/${sourceQueryUuid}/calculate-total`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify({
            kind,
            subtotalDimensions,
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

    const rows = await fetchAllResultRows(projectUuid, queryUuid);

    const indexFieldIdSet = new Set(indexFieldIds);
    const map: PivotRowTotalsByIndex = {};
    for (const row of rows) {
        const key = buildPivotRowTotalKey(
            indexFieldIds.map((fieldId) => [fieldId, row[fieldId]?.value.raw]),
        );
        const metricTotals: Record<string, number> = {};
        for (const [fieldId, cell] of Object.entries(row)) {
            if (indexFieldIdSet.has(fieldId)) continue;
            const numeric = Number(cell?.value.raw);
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

// Map keyed by `getSubtotalKey(dims)`; each entry is one flat row per
// subtotal-group × pivot-value, with dimension raw values and metric numbers.
export type GroupedSubtotals = Record<string, Record<string, number>[]>;

// Mirrors the backend SubtotalsCalculator.prepareDimensionGroups: order the
// non-pivot dimensions by columnOrder, drop the most-detailed (last) one, and
// build the nesting prefixes that each get their own subtotal level.
const getSubtotalDimensionGroups = (
    dimensions: string[],
    columnOrder: string[],
    pivotDimensions: string[],
): string[][] => {
    const ordered = [...dimensions].sort((a, b) => {
        const aIndex = columnOrder.indexOf(a);
        const bIndex = columnOrder.indexOf(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });
    const withoutPivot = ordered.filter((d) => !pivotDimensions.includes(d));
    const toSubtotal = withoutPivot.slice(0, -1);
    return toSubtotal.map((_, index) => toSubtotal.slice(0, index + 1));
};

// One async calculate-total call per nesting level (kind 'columnSubtotal'),
// run in parallel. Each level's flat result is keyed by getSubtotalKey so the
// pivot worker / treemap can match each rendered group. Dimension keys keep
// their raw value (for === matching); metric keys are coerced to numbers.
const fetchSubtotals = async (args: {
    projectUuid: string;
    sourceQueryUuid: string;
    dimensionGroups: string[][];
    pivotDimensions: string[];
    invalidateCache?: boolean;
}): Promise<GroupedSubtotals> => {
    const { projectUuid, sourceQueryUuid, dimensionGroups, pivotDimensions } =
        args;
    // Dimension columns keep their raw value (for === matching); everything
    // else is a metric and is coerced to a number.
    const dimensionKeys = new Set<string>([
        ...pivotDimensions,
        ...dimensionGroups.flat(),
    ]);

    const entries = await Promise.all(
        dimensionGroups.map(
            async (group): Promise<[string, RawResultRow[]]> => {
                const { queryUuid } = await startCalculateTotalQuery({
                    projectUuid,
                    sourceQueryUuid,
                    kind: 'columnSubtotal',
                    subtotalDimensions: group,
                    invalidateCache: args.invalidateCache,
                });

                const query = await pollForResults(projectUuid, queryUuid);
                if (
                    query.status === QueryHistoryStatus.ERROR ||
                    query.status === QueryHistoryStatus.EXPIRED
                ) {
                    throw new Error(query.error || 'Error computing subtotals');
                }
                if (query.status !== QueryHistoryStatus.READY) {
                    throw new Error(
                        'Unexpected query status while polling subtotals',
                    );
                }

                const rows = await fetchAllResultRows(projectUuid, queryUuid);

                const records = rows.map((row) => {
                    const record: Record<string, unknown> = {};
                    for (const [fieldId, cell] of Object.entries(row)) {
                        const raw = cell?.value.raw;
                        if (dimensionKeys.has(fieldId)) {
                            record[fieldId] = raw;
                        } else {
                            const numeric = Number(raw);
                            record[fieldId] = Number.isFinite(numeric)
                                ? numeric
                                : raw;
                        }
                    }
                    return record as RawResultRow;
                });

                return [getSubtotalKey(group), records];
            },
        ),
    );

    return Object.fromEntries(entries) as GroupedSubtotals;
};

export const useAsyncCalculateSubtotals = ({
    projectUuid,
    sourceQueryUuid,
    dimensions,
    columnOrder,
    pivotDimensions,
    enabled,
    invalidateCache,
}: {
    projectUuid: string | undefined;
    sourceQueryUuid: string | undefined;
    dimensions: string[] | undefined;
    columnOrder: string[];
    pivotDimensions: string[] | undefined;
    enabled: boolean;
    invalidateCache?: boolean;
}) => {
    const dimensionGroups = getSubtotalDimensionGroups(
        dimensions ?? [],
        columnOrder,
        pivotDimensions ?? [],
    );

    return useQuery<GroupedSubtotals, ApiError>({
        queryKey: [
            'calculate_async_subtotals',
            projectUuid,
            sourceQueryUuid,
            dimensionGroups,
            pivotDimensions,
            invalidateCache,
        ],
        queryFn: () => {
            if (!projectUuid || !sourceQueryUuid) {
                return Promise.reject(
                    new Error(
                        'Missing projectUuid or sourceQueryUuid for async subtotals',
                    ),
                );
            }
            return fetchSubtotals({
                projectUuid,
                sourceQueryUuid,
                dimensionGroups,
                pivotDimensions: pivotDimensions ?? [],
                invalidateCache,
            });
        },
        enabled:
            enabled &&
            !!projectUuid &&
            !!sourceQueryUuid &&
            dimensionGroups.length > 0,
        retry: false,
    });
};
