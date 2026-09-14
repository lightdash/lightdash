import {
    derivePivotConfigurationFromChart,
    getFieldsFromMetricQuery,
    type PivotConfiguration,
} from '@lightdash/common';
import { useMemo } from 'react';
import {
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerResultsData } from './useExplorerResultsData';

/**
 * The pivot the Explorer's dirty configuration implies — derived the way the
 * next run will derive it. Compared against the pivot behind the results on
 * screen, a difference means those results are stale. One reader for the
 * chart card's warning and the chart type builder's.
 */
export const useDirtyPivotConfiguration = ():
    | PivotConfiguration
    | undefined => {
    const unsavedChartVersion = useExplorerSelector(selectUnsavedChartVersion);
    const { data: explore } = useExplore(unsavedChartVersion.tableName);
    const { mergeResults, suppressPrimaryResults } = useExplorerResultsData();
    const visualizationMetricQuery = suppressPrimaryResults
        ? undefined
        : (mergeResults?.metricQuery ?? unsavedChartVersion.metricQuery);

    return useMemo(() => {
        const fields =
            mergeResults?.fields ??
            (explore
                ? getFieldsFromMetricQuery(
                      unsavedChartVersion.metricQuery,
                      explore,
                  )
                : undefined);

        return visualizationMetricQuery && fields
            ? derivePivotConfigurationFromChart(
                  unsavedChartVersion,
                  visualizationMetricQuery,
                  fields,
              )
            : undefined;
    }, [unsavedChartVersion, visualizationMetricQuery, mergeResults, explore]);
};
