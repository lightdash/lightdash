import { createContext } from 'react';
import { type DashboardContextType } from './types';

export type FilterFields = Pick<
    DashboardContextType,
    | 'filterableFieldsByTileUuid'
    | 'allFilterableFields'
    | 'allFilterableMetrics'
    | 'allFilterableFieldsMap'
    | 'allFilterableMetricsMap'
    | 'hiddenFilterableFieldIds'
>;

export type FilterFieldsOverride = FilterFields &
    Pick<
        DashboardContextType,
        'isLoadingDashboardFilters' | 'isFetchingDashboardFilters'
    >;

/** Filter fields a subtree reads instead of the store's live ones (see SettledFilterFields) */
export const FilterFieldsOverrideContext =
    createContext<FilterFieldsOverride | null>(null);
