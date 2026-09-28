import { isApiError, type ResultRow } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { fetchColumnSubtotalRows } from '../../../hooks/useAsyncCalculateTotal';
import {
    filterRowsToParent,
    parseVizSubtotalIntent,
} from '../utils/vizSubtotals';

export type VizSubtotalSource = {
    dimensions: string[];
    get: (intent: unknown) => Promise<{ rows: ResultRow[] }>;
};

const KEY_SEPARATOR = '\u0000';

export const useVizSubtotalSource = ({
    projectUuid,
    sourceQueryUuid,
    dimensions,
}: {
    projectUuid: string | undefined;
    sourceQueryUuid: string | undefined;
    dimensions: string[] | null;
}): VizSubtotalSource | null => {
    const queryClient = useQueryClient();
    const latestSource = useRef<VizSubtotalSource | null>(null);
    // Compared by value: a rebuilt array with the same bindings is no change.
    const dimensionsKey = dimensions ? dimensions.join(KEY_SEPARATOR) : null;
    const boundDimensions = useMemo(
        () =>
            dimensionsKey === null ? null : dimensionsKey.split(KEY_SEPARATOR),
        [dimensionsKey],
    );

    const source = useMemo<VizSubtotalSource | null>(() => {
        if (!projectUuid || !sourceQueryUuid || !boundDimensions) return null;
        // Rejects levels asked of, or landing for, a query or hierarchy that
        // is no longer the one on screen.
        const assertCurrent = () => {
            if (latestSource.current !== current) {
                throw new Error(
                    'The chart query changed during subtotal expansion.',
                );
            }
        };
        const current: VizSubtotalSource = {
            dimensions: boundDimensions,
            get: async (intent: unknown) => {
                const { subtotalDimensions, parentValues } =
                    parseVizSubtotalIntent(boundDimensions, intent);
                assertCurrent();
                const rows = await queryClient.fetchQuery({
                    queryKey: [
                        'viz-subtotals',
                        projectUuid,
                        sourceQueryUuid,
                        subtotalDimensions,
                    ],
                    queryFn: () =>
                        fetchColumnSubtotalRows({
                            projectUuid,
                            sourceQueryUuid,
                            subtotalDimensions,
                        }).catch((error: unknown) => {
                            throw isApiError(error)
                                ? new Error(error.error.message)
                                : error;
                        }),
                    staleTime: Infinity,
                    retry: false,
                });
                assertCurrent();
                return {
                    rows: filterRowsToParent(
                        rows,
                        boundDimensions,
                        parentValues,
                    ),
                };
            },
        };
        return current;
    }, [projectUuid, sourceQueryUuid, boundDimensions, queryClient]);
    useLayoutEffect(() => {
        latestSource.current = source;
    }, [source]);
    return source;
};
