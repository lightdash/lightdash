import { type ResultRow, type SubtotalLevelRequest } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { type VizSubtotalSource } from '../../../components/LightdashVisualization/context';
import { buildVizSubtotalRequest } from '../utils/vizSubtotals';

/**
 * Loads deeper hierarchy levels on demand. `rootKey` identifies the root
 * result on screen; levels that land after it changed are rejected.
 */
export const useVizSubtotalSource = ({
    dimensions,
    rootKey,
    fetchRows,
}: {
    dimensions: string[] | null;
    rootKey: string | undefined;
    fetchRows: (subtotalLevel: SubtotalLevelRequest) => Promise<ResultRow[]>;
}): VizSubtotalSource | undefined => {
    const queryClient = useQueryClient();
    const latestRootKey = useRef(rootKey);
    latestRootKey.current = rootKey;
    const latestFetchRows = useRef(fetchRows);
    latestFetchRows.current = fetchRows;

    return useMemo(() => {
        if (!dimensions || !rootKey) return undefined;
        const assertCurrent = () => {
            if (latestRootKey.current !== rootKey)
                throw new Error(
                    'The chart query changed during subtotal expansion.',
                );
        };
        return {
            dimensions,
            get: async (intent: unknown) => {
                assertCurrent();
                const subtotalLevel = buildVizSubtotalRequest(
                    dimensions,
                    intent,
                );
                const rows = await queryClient.fetchQuery({
                    queryKey: ['viz-subtotals', rootKey, subtotalLevel],
                    queryFn: () => latestFetchRows.current(subtotalLevel),
                    staleTime: Infinity,
                });
                assertCurrent();
                return { rows };
            },
        };
    }, [dimensions, rootKey, queryClient]);
};
