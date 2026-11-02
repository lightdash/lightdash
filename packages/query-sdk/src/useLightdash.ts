/**
 * React hook for executing a Lightdash query.
 *
 * Usage:
 *   const { data, loading, error } = useLightdash(
 *     lightdash
 *       .model('orders')
 *       .metrics(['total_revenue'])
 *       .dimensions(['customer_segment'])
 *   )
 *
 *   // data is an array of flat objects:
 *   // [{ customer_segment: 'Enterprise', total_revenue: 124000 }]
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ComposerQuery } from './compose';
import { useMountedQuery } from './insights';
import { useTransport } from './LightdashProvider';
import { QueryBuilder } from './query';
import { savedChartQueryKey, type SavedChartQuery } from './savedChart';
import type {
    Column,
    DownloadUnderlyingDataOptions,
    DownloadResultsOptions,
    DownloadResultsResult,
    FormatFunction,
    QueryResult,
    Row,
    UnderlyingDataOptions,
    UnderlyingDataResult,
} from './types';

export type LineageProps = {
    'data-ld-query'?: string;
    'data-ld-query-id'?: string;
};

/**
 * Props an app spreads onto the root element of a query-bound block so the
 * Lightdash parent can trace a clicked element back to its query.
 * `data-ld-query-id` (the author id) is present immediately;
 * `data-ld-query` once the query has a queryUuid. Always spread-safe.
 */
export const buildLineageProps = (
    queryUuid: string | null,
    queryId: string | null,
): LineageProps => ({
    ...(queryId ? { 'data-ld-query-id': queryId } : {}),
    ...(queryUuid ? { 'data-ld-query': queryUuid } : {}),
});

const noopFormat: FormatFunction = (_row, _fieldId) => '';

type UseLightdashResult = {
    /** Result rows as flat objects. Numbers are numbers, strings are strings. */
    data: Row[];
    /** Column metadata (name, label, type) */
    columns: Column[];
    /** Format a field value for display: format(row, 'total_revenue') → "$1,234" */
    format: FormatFunction;
    /** Total rows returned by the source query. */
    totalResults: number | null;
    /** True while the query is executing */
    loading: boolean;
    /** Error if the query failed, null otherwise */
    error: Error | null;
    /** Re-run the query */
    refetch: () => void;
    /** Async query UUID for the source query, once loaded. */
    queryUuid: string | null;
    /** Row key for each qualified Lightdash field id; see `QueryResult.rowKeys`. */
    rowKeys: Record<string, string>;
    /** Spread onto the root element of this query's UI block to enable data lineage. */
    lineage: LineageProps;
    /** Fetch raw rows behind an aggregated metric value from this query result. */
    getUnderlyingData: (
        options: UnderlyingDataOptions,
    ) => Promise<UnderlyingDataResult>;
    /** Schedule a backend CSV/XLSX export for rows behind an aggregated metric value. */
    downloadUnderlyingData: (
        options: DownloadUnderlyingDataOptions,
    ) => Promise<DownloadResultsResult>;
    /** Schedule a backend CSV/XLSX export for this query result. */
    downloadResults: (
        options?: DownloadResultsOptions,
    ) => Promise<DownloadResultsResult>;
};

export function useLightdash(
    query: QueryBuilder | SavedChartQuery | ComposerQuery,
): UseLightdashResult {
    const transport = useTransport();
    const [data, setData] = useState<Row[]>([]);
    const [columns, setColumns] = useState<Column[]>([]);
    const [format, setFormat] = useState<FormatFunction>(() => noopFormat);
    const [totalResults, setTotalResults] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [fetchCount, setFetchCount] = useState(0);
    const [queryUuid, setQueryUuid] = useState<string | null>(null);
    const [rowKeys, setRowKeys] = useState<Record<string, string>>({});
    const [getUnderlyingData, setGetUnderlyingData] = useState<
        UseLightdashResult['getUnderlyingData']
    >(() => async () => {
        throw new Error(
            'Underlying data is not available before the query loads.',
        );
    });
    const [downloadResults, setDownloadResults] = useState<
        UseLightdashResult['downloadResults']
    >(() => async () => {
        throw new Error('Downloads are not available before the query loads.');
    });
    const [downloadUnderlyingData, setDownloadUnderlyingData] = useState<
        UseLightdashResult['downloadUnderlyingData']
    >(() => async () => {
        throw new Error(
            'Underlying data downloads are not available before the query loads.',
        );
    });

    const { queryKey, queryId } = useMemo(() => {
        if (query instanceof QueryBuilder) {
            const definition = query.build();
            return {
                queryKey: JSON.stringify(definition),
                queryId: definition.id ?? null,
            };
        }
        if (query instanceof ComposerQuery) {
            const definition = query.build();
            return {
                queryKey: `composer:${JSON.stringify(definition)}`,
                queryId: definition.id,
            };
        }
        return {
            queryKey: savedChartQueryKey(query),
            queryId: query.idText ?? null,
        };
    }, [query]);

    // Set by refetch() so the next run skips the composer result cache.
    const refreshRequested = useRef(false);
    const refetch = useCallback(() => {
        refreshRequested.current = true;
        setFetchCount((c) => c + 1);
    }, []);

    const lineage = useMemo(
        () => buildLineageProps(queryUuid, queryId),
        [queryUuid, queryId],
    );
    useMountedQuery(queryUuid);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setQueryUuid(null);
        setTotalResults(null);
        setGetUnderlyingData(() => async () => {
            throw new Error(
                'Underlying data is not available before the query loads.',
            );
        });
        setDownloadResults(() => async () => {
            throw new Error(
                'Downloads are not available before the query loads.',
            );
        });
        setDownloadUnderlyingData(() => async () => {
            throw new Error(
                'Underlying data downloads are not available before the query loads.',
            );
        });

        const refresh = refreshRequested.current;
        refreshRequested.current = false;
        let exec: Promise<QueryResult>;
        if (query instanceof QueryBuilder) {
            exec = transport.executeQuery(query.build());
        } else if (query instanceof ComposerQuery) {
            exec = transport.executeComposer
                ? transport.executeComposer(query.build(), { refresh })
                : Promise.reject(
                      new Error(
                          'Composer pipelines are not supported by this transport.',
                      ),
                  );
        } else {
            exec = transport.executeSavedChart({
                chartUuid: query.chartUuid,
                label: query.labelText,
                id: query.idText,
                description: query.descriptionText,
                limit: query.limitValue,
                parameters: query.parameterValues,
                filters: query.filterValues,
            });
        }

        exec.then((res) => {
            if (!cancelled) {
                setData(res.rows);
                setColumns(res.columns);
                setFormat(() => res.format);
                setTotalResults(res.totalResults ?? res.rows.length);
                setQueryUuid(res.queryUuid ?? null);
                setRowKeys(res.rowKeys ?? {});
                setGetUnderlyingData(
                    () => async (options: UnderlyingDataOptions) => {
                        if (!res.getUnderlyingData) {
                            throw new Error(
                                'Underlying data is not supported by this Lightdash transport.',
                            );
                        }
                        return res.getUnderlyingData(options);
                    },
                );
                setDownloadResults(
                    () => async (options?: DownloadResultsOptions) => {
                        if (!res.downloadResults) {
                            throw new Error(
                                'Downloads are not supported by this Lightdash transport.',
                            );
                        }
                        return res.downloadResults(options);
                    },
                );
                setDownloadUnderlyingData(
                    () => async (options: DownloadUnderlyingDataOptions) => {
                        if (!res.downloadUnderlyingData) {
                            throw new Error(
                                'Underlying data downloads are not supported by this Lightdash transport.',
                            );
                        }
                        return res.downloadUnderlyingData(options);
                    },
                );
                setLoading(false);
            }
        }).catch((err: unknown) => {
            if (!cancelled) {
                setError(err instanceof Error ? err : new Error(String(err)));
                setQueryUuid(null);
                setTotalResults(null);
                setLoading(false);
            }
        });

        return () => {
            cancelled = true;
        };
        // queryKey tracks query identity. query is intentionally omitted.
    }, [queryKey, transport, fetchCount]); // eslint-disable-line

    return {
        data,
        columns,
        format,
        totalResults,
        loading,
        error,
        refetch,
        queryUuid,
        rowKeys,
        lineage,
        getUnderlyingData,
        downloadUnderlyingData,
        downloadResults,
    };
}
