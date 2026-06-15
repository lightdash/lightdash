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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTransport } from './LightdashProvider';
import type { QueryBuilder } from './query';
import type {
    Column,
    DownloadUnderlyingDataOptions,
    DownloadResultsOptions,
    DownloadResultsResult,
    FormatFunction,
    Row,
    UnderlyingDataOptions,
    UnderlyingDataResult,
} from './types';

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

export function useLightdash(query: QueryBuilder): UseLightdashResult {
    const transport = useTransport();
    const [data, setData] = useState<Row[]>([]);
    const [columns, setColumns] = useState<Column[]>([]);
    const [format, setFormat] = useState<FormatFunction>(() => noopFormat);
    const [totalResults, setTotalResults] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [fetchCount, setFetchCount] = useState(0);
    const [queryUuid, setQueryUuid] = useState<string | null>(null);
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

    const queryKey = useMemo(() => JSON.stringify(query.build()), [query]);

    const refetch = useCallback(() => {
        setFetchCount((c) => c + 1);
    }, []);

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

        const definition = query.build();

        transport
            .executeQuery(definition)
            .then((res) => {
                if (!cancelled) {
                    setData(res.rows);
                    setColumns(res.columns);
                    setFormat(() => res.format);
                    setTotalResults(res.totalResults ?? res.rows.length);
                    setQueryUuid(res.queryUuid ?? null);
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
                        () =>
                            async (options: DownloadUnderlyingDataOptions) => {
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
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(
                        err instanceof Error ? err : new Error(String(err)),
                    );
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
        getUnderlyingData,
        downloadUnderlyingData,
        downloadResults,
    };
}
