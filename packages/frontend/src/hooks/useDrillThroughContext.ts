import { type DrillThroughState } from '@lightdash/common';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { DRILL_THROUGH_PARAM } from './useDrillThroughAction';

/**
 * Reads drill-through context from the URL search param.
 * The context is encoded as JSON in the `drillContext` param,
 * so it survives page refreshes and works across tabs.
 *
 * Memoised on the raw param string (stable across renders for
 * the same URL) so downstream effects don't re-run unnecessarily.
 * useSearchParams ensures the raw value updates on back/forward.
 */
export const useDrillThroughContext =
    (): DrillThroughState | null => {
        const [searchParams] = useSearchParams();
        const raw = searchParams.get(DRILL_THROUGH_PARAM);

        return useMemo(() => {
            if (!raw) return null;
            try {
                return JSON.parse(
                    decodeURIComponent(raw),
                ) as DrillThroughState;
            } catch {
                return null;
            }
        }, [raw]);
    };
