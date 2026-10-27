import { useState, type FC, type ReactNode } from 'react';
import DashboardContext from '../../providers/Dashboard/context';
import { type DashboardContextType } from '../../providers/Dashboard/types';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';

type FilterFields = Pick<
    DashboardContextType,
    | 'filterableFieldsByTileUuid'
    | 'allFilterableFields'
    | 'allFilterableMetrics'
    | 'allFilterableFieldsMap'
    | 'allFilterableMetricsMap'
    | 'hiddenFilterableFieldIds'
>;

// A new set of tiles (one removed or added) starts the available filters
// over, as a first load. Below this, the bar keeps the fields it last had
// and reads that as a refetch, so it never drops back to its skeletons
export const SettledFilterFields: FC<{ children: ReactNode }> = ({
    children,
}) => {
    const context = useDashboardContext((c) => c);
    const [settled, setSettled] = useState<FilterFields | null>(null);
    const isReloading = context.isLoadingDashboardFilters;
    if (
        !isReloading &&
        context.filterableFieldsByTileUuid !== undefined &&
        context.filterableFieldsByTileUuid !==
            settled?.filterableFieldsByTileUuid
    ) {
        setSettled({
            filterableFieldsByTileUuid: context.filterableFieldsByTileUuid,
            allFilterableFields: context.allFilterableFields,
            allFilterableMetrics: context.allFilterableMetrics,
            allFilterableFieldsMap: context.allFilterableFieldsMap,
            allFilterableMetricsMap: context.allFilterableMetricsMap,
            hiddenFilterableFieldIds: context.hiddenFilterableFieldIds,
        });
    }
    const value =
        isReloading && settled !== null
            ? {
                  ...context,
                  ...settled,
                  isLoadingDashboardFilters: false,
                  isFetchingDashboardFilters: true,
              }
            : context;
    return (
        <DashboardContext.Provider value={value}>
            {children}
        </DashboardContext.Provider>
    );
};
