/**
 * `useSpaceCharts('<space slug or uuid>')` — the saved charts the viewer can
 * see in a space, resolved at runtime with the viewer's own credentials. The
 * list reflects existing space permissions: a space the viewer can't access
 * answers exactly like one that doesn't exist (`space: null`, no charts).
 *
 * Feed an entry's `uuid` into `savedChart(...)` to render it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTransport } from './LightdashProvider';
import { type SpaceChartsResult, type SpaceChartSummary } from './types';

const EMPTY_RESULT: SpaceChartsResult = { space: null, charts: [] };

export type SpaceCharts = {
    /** False on a transport without the capability (older custom hosts). */
    available: boolean;
    /** Null while loading, on error, or when the space isn't accessible. */
    space: { uuid: string; name: string; slug: string } | null;
    charts: SpaceChartSummary[];
    loading: boolean;
    error: Error | null;
    /** Re-fetch the list, e.g. after the viewer saved a chart elsewhere. */
    refresh: () => void;
};

export function useSpaceCharts(space: string): SpaceCharts {
    const transport = useTransport();
    const listSpaceCharts = transport.listSpaceCharts;
    const available = listSpaceCharts !== undefined;
    const [result, setResult] = useState<SpaceChartsResult>(EMPTY_RESULT);
    const [loading, setLoading] = useState(available);
    const [error, setError] = useState<Error | null>(null);
    const [fetchCount, setFetchCount] = useState(0);
    // Drops responses from superseded fetches (space change, refresh, unmount).
    const fetchSeq = useRef(0);

    useEffect(() => {
        if (!listSpaceCharts || space.trim().length === 0) {
            setResult(EMPTY_RESULT);
            setLoading(false);
            setError(
                space.trim().length === 0 && available
                    ? new Error('useSpaceCharts: pass a space slug or uuid')
                    : null,
            );
            return undefined;
        }
        fetchSeq.current += 1;
        const seq = fetchSeq.current;
        setLoading(true);
        setError(null);
        listSpaceCharts(space.trim())
            .then((value) => {
                if (fetchSeq.current !== seq) return;
                setResult(value);
                setLoading(false);
            })
            .catch((e: unknown) => {
                if (fetchSeq.current !== seq) return;
                setResult(EMPTY_RESULT);
                setError(e instanceof Error ? e : new Error(String(e)));
                setLoading(false);
            });
        return () => {
            // Invalidate in-flight responses for the unmount/re-run.
            if (fetchSeq.current === seq) fetchSeq.current += 1;
        };
    }, [listSpaceCharts, space, fetchCount, available]);

    const refresh = useCallback(() => setFetchCount((n) => n + 1), []);

    return {
        available,
        space: result.space,
        charts: result.charts,
        loading,
        error,
        refresh,
    };
}
