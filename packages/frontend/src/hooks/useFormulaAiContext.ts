import {
    getItemMap,
    isField,
    isTableCalculation,
    type Explore,
    type FormulaAiContext,
    type MetricQuery,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';

export const useFormulaAiContext = (
    explore: Explore | undefined,
    metricQuery: MetricQuery,
) => {
    const itemsMap = useMemo(() => {
        if (!explore) return undefined;
        return getItemMap(
            explore,
            metricQuery.additionalMetrics,
            metricQuery.tableCalculations,
            metricQuery.customDimensions,
        );
    }, [
        explore,
        metricQuery.additionalMetrics,
        metricQuery.tableCalculations,
        metricQuery.customDimensions,
    ]);

    const buildContext = useCallback((): FormulaAiContext | null => {
        if (!itemsMap) return null;

        const tableName = explore?.label ?? explore?.name ?? '';
        const baseTableName = explore?.baseTable ?? '';

        const usedFieldIds = new Set([
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...(metricQuery.tableCalculations ?? []).map((tc) => tc.name),
        ]);

        const fieldsContext = Object.entries(itemsMap)
            .filter(([id]) => usedFieldIds.has(id))
            .map(([, item]) => ({
                name: item.name,
                table: isField(item) ? item.table : baseTableName,
                label: isField(item)
                    ? item.label
                    : isTableCalculation(item)
                      ? (item.displayName ?? item.name)
                      : item.name,
                type: item.type ?? 'unknown',
                description: isField(item) ? item.description : undefined,
                fieldType: isField(item)
                    ? item.fieldType === 'dimension'
                        ? ('dimension' as const)
                        : ('metric' as const)
                    : ('table_calculation' as const),
            }));

        const existingTableCalculations = (
            metricQuery.tableCalculations ?? []
        ).map((tc) => tc.displayName);

        return {
            tableName,
            fieldsContext,
            existingTableCalculations,
        };
    }, [itemsMap, explore, metricQuery]);

    return { buildContext, isReady: !!itemsMap };
};
