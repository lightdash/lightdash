import { getCompatibleDashboardMetrics, getItemId } from '@lightdash/common';
import { useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { useExplore } from '../useExplore';

/**
 * Registry metrics compatible with the given Explore, ready to seed a chart
 * built inside the dashboard. Host-agnostic: reads the staged registry from
 * the dashboard context and knows nothing about who hosts the Explorer.
 */
export const useDashboardCustomMetricSeed = (
    exploreName: string | undefined,
) => {
    const registry = useDashboardContext((c) => c.dashboardCustomMetrics);
    const { data: explore, isInitialLoading } = useExplore(
        registry.length > 0 ? exploreName : undefined,
    );

    return useMemo(() => {
        const seededMetrics = getCompatibleDashboardMetrics(registry, explore);
        return {
            seededMetrics,
            dashboardMetricIds: new Set(seededMetrics.map(getItemId)),
            isLoading: registry.length > 0 && !!exploreName && isInitialLoading,
        };
    }, [registry, explore, exploreName, isInitialLoading]);
};
