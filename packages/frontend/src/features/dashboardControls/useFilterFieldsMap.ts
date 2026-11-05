import { useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { type FieldsMap } from './peers';

// A tile reports metrics too, and a filter can be on a metric
export const useFilterFieldsMap = (): FieldsMap => {
    const dimensionsMap = useDashboardContext((c) => c.allFilterableFieldsMap);
    const metricsMap = useDashboardContext((c) => c.allFilterableMetricsMap);
    return useMemo(
        () => ({ ...dimensionsMap, ...metricsMap }),
        [dimensionsMap, metricsMap],
    );
};
