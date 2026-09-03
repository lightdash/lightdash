import {
    getItemId,
    getItemMap,
    isCustomDimension,
    isDimension,
    isField,
    isTableCalculation,
    type Item,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import {
    explorerActions,
    selectMetricQuery,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useExplore } from '../../../hooks/useExplore';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';

/**
 * The pool behind a config picker's "Add to query" group: visible explore
 * fields the last run's results don't offer. Picking one adds it to the query
 * and re-runs. Explorer-only — the config panels render inside its store.
 */
export const useAddFieldsToQuery = () => {
    const { itemsMap } = useVisualizationContext();
    const dispatch = useExplorerDispatch();
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const { data: explore } = useExplore(tableName, { refetchOnMount: false });

    const addableItems = useMemo(() => {
        if (!explore) return [];
        const allItems = getItemMap(
            explore,
            metricQuery.additionalMetrics,
            metricQuery.tableCalculations,
            metricQuery.customDimensions,
        );
        return Object.entries(allItems).flatMap(([id, item]) =>
            (itemsMap && id in itemsMap) || (isField(item) && item.hidden)
                ? []
                : [item],
        );
    }, [explore, metricQuery, itemsMap]);

    // Selected in the query but missing from the last results: the run this
    // field's add action requested hasn't landed yet.
    const isFieldPending = useCallback(
        (fieldId: string | null | undefined): boolean =>
            !!fieldId &&
            !(itemsMap && fieldId in itemsMap) &&
            (metricQuery.dimensions.includes(fieldId) ||
                metricQuery.metrics.includes(fieldId) ||
                metricQuery.tableCalculations.some(
                    (tc) => tc.name === fieldId,
                )),
        [itemsMap, metricQuery],
    );

    const addFieldToQuery = useCallback(
        (item: Item) => {
            if (isDimension(item) || isCustomDimension(item)) {
                dispatch(explorerActions.addDimensionToQuery(getItemId(item)));
            } else if (isTableCalculation(item)) {
                // Always part of the query; only the run is missing.
                dispatch(explorerActions.requestQueryExecution());
            } else {
                dispatch(explorerActions.addMetricToQuery(getItemId(item)));
            }
        },
        [dispatch],
    );

    return { addableItems, addFieldToQuery, isFieldPending };
};
