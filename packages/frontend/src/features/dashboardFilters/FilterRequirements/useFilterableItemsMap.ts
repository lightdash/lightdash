import { type FilterableItem } from '@lightdash/common';
import { useMemo } from 'react';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';

/** Dashboard dimensions + metrics merged into one filterable-item lookup */
export const useFilterableItemsMap = (): Record<string, FilterableItem> => {
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );

    return useMemo(
        () => ({ ...allFilterableFieldsMap, ...allFilterableMetricsMap }),
        [allFilterableFieldsMap, allFilterableMetricsMap],
    );
};
