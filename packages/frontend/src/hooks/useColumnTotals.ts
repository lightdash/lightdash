import {
    ApiQueryResults,
    DimensionType,
    Field,
    FieldId,
    getResultColumnTotals,
    isAdditionalMetric,
    isField,
    MetricType,
    TableCalculation,
} from '@lightdash/common';
import { useMemo } from 'react';

type Args = {
    resultsData: ApiQueryResults | undefined;
    itemsMap: Record<FieldId, Field | TableCalculation>;
};

const isSummable = (item: Field | TableCalculation) => {
    if (isField(item) || isAdditionalMetric(item)) {
        const numericTypes: string[] = [
            DimensionType.NUMBER,
            MetricType.NUMBER,
            MetricType.COUNT,
            MetricType.COUNT_DISTINCT,
            MetricType.SUM,
            MetricType.MIN,
            MetricType.MAX,
        ];
        const isPercent = item.format === 'percent';
        return numericTypes.includes(item.type) && !isPercent;
    }
    return true;
};
const useColumnTotals = ({ resultsData, itemsMap }: Args) => {
    return useMemo<Record<FieldId, number | undefined>>(() => {
        if (resultsData) {
            return getResultColumnTotals(
                resultsData.rows,
                Object.values(itemsMap).filter((field) => isSummable(field)),
            );
        }
        return {};
    }, [itemsMap, resultsData]);
};

export default useColumnTotals;
