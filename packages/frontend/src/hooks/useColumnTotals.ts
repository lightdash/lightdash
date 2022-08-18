import {
    ApiQueryResults,
    DimensionType,
    Field,
    FieldId,
    getItemId,
    isAdditionalMetric,
    isField,
    MetricType,
    ResultRow,
    TableCalculation,
} from '@lightdash/common';
import { useMemo } from 'react';

type Args = {
    resultsData: ApiQueryResults | undefined;
    itemsMap: Record<FieldId, Field | TableCalculation>;
};

export const isSummable = (item: Field | TableCalculation) => {
    if (isField(item) || isAdditionalMetric(item)) {
        const numericTypes: string[] = [
            DimensionType.NUMBER,
            MetricType.NUMBER,
            MetricType.COUNT,
            MetricType.COUNT_DISTINCT,
            MetricType.SUM,
        ];
        const isPercent = item.format === 'percent';
        return numericTypes.includes(item.type) && !isPercent;
    }
    return true;
};

export const getResultColumnTotals = (
    rows: ResultRow[],
    keys: Array<string>,
): Record<FieldId, number | undefined> => {
    if (keys.length > 0) {
        return rows.reduce<Record<FieldId, number | undefined>>(
            (acc, row: ResultRow) => {
                keys.forEach((key) => {
                    if (row[key]) {
                        acc[key] = (acc[key] || 0) + Number(row[key].value.raw);
                    }
                });
                return acc;
            },
            {},
        );
    }
    return {};
};

export const getResultColumnTotalsFromItemsMap = (
    rows: ResultRow[],
    itemsMap: Record<FieldId, Field | TableCalculation>,
): Record<FieldId, number | undefined> => {
    return getResultColumnTotals(
        rows,
        Object.values(itemsMap).reduce<string[]>(
            (acc, item) => (isSummable(item) ? [...acc, getItemId(item)] : acc),
            [],
        ),
    );
};

const useColumnTotals = ({ resultsData, itemsMap }: Args) => {
    return useMemo<Record<FieldId, number | undefined>>(() => {
        if (resultsData) {
            return getResultColumnTotalsFromItemsMap(
                resultsData.rows,
                itemsMap,
            );
        }
        return {};
    }, [itemsMap, resultsData]);
};

export default useColumnTotals;
