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
import type { Column, FormatFunction, Row } from './types';

const noopFormat: FormatFunction = (_row, _fieldId) => '';

type UseLightdashResult = {
    /** Result rows as flat objects. Numbers are numbers, strings are strings. */
    data: Row[];
    /** Column metadata (name, label, type) */
    columns: Column[];
    /** Format a field value for display: format(row, 'total_revenue') → "$1,234" */
    format: FormatFunction;
    /** True while the query is executing */
    loading: boolean;
    /** Error if the query failed, null otherwise */
    error: Error | null;
    /** Re-run the query */
    refetch: () => void;
};

export function useLightdash(query: QueryBuilder): UseLightdashResult {
    const transport = useTransport();
    const [data, setData] = useState<Row[]>([]);
    const [columns, setColumns] = useState<Column[]>([]);
    const [format, setFormat] = useState<FormatFunction>(() => noopFormat);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [fetchCount, setFetchCount] = useState(0);

    const queryKey = useMemo(() => JSON.stringify(query.build()), [query]);

    const refetch = useCallback(() => {
        setFetchCount((c) => c + 1);
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        const definition = query.build();

        transport
            .executeQuery(definition)
            .then((res) => {
                if (!cancelled) {
                    setData(res.rows);
                    setColumns(res.columns);
                    setFormat(() => res.format);
                    setLoading(false);
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(
                        err instanceof Error ? err : new Error(String(err)),
                    );
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
        // queryKey tracks query identity. query is intentionally omitted.
    }, [queryKey, transport, fetchCount]); // eslint-disable-line

    return { data, columns, format, loading, error, refetch };
}
