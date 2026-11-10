import { useMemo, useState, type FC, type ReactNode } from 'react';
import {
    FilterFieldsOverrideContext,
    type FilterFields,
} from '../../providers/Dashboard/filterFieldsOverride';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';

// A new set of tiles (one removed or added) starts the available filters
// over, as a first load. Below this, the bar keeps the fields it last had
// and reads that as a refetch, so it never drops back to its skeletons
export const SettledFilterFields: FC<{ children: ReactNode }> = ({
    children,
}) => {
    const isReloading = useDashboardContext((c) => c.isLoadingDashboardFilters);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    const allFilterableMetrics = useDashboardContext(
        (c) => c.allFilterableMetrics,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const hiddenFilterableFieldIds = useDashboardContext(
        (c) => c.hiddenFilterableFieldIds,
    );
    const [settled, setSettled] = useState<FilterFields | null>(null);
    if (
        !isReloading &&
        filterableFieldsByTileUuid !== undefined &&
        filterableFieldsByTileUuid !== settled?.filterableFieldsByTileUuid
    ) {
        setSettled({
            filterableFieldsByTileUuid,
            allFilterableFields,
            allFilterableMetrics,
            allFilterableFieldsMap,
            allFilterableMetricsMap,
            hiddenFilterableFieldIds,
        });
    }
    const override = useMemo(
        () =>
            isReloading && settled !== null
                ? {
                      ...settled,
                      isLoadingDashboardFilters: false,
                      isFetchingDashboardFilters: true,
                  }
                : null,
        [isReloading, settled],
    );
    return (
        <FilterFieldsOverrideContext.Provider value={override}>
            {children}
        </FilterFieldsOverrideContext.Provider>
    );
};
