import {
    DimensionType,
    getItemId,
    isCustomDimension,
    isDimension,
    isTableCalculation,
    MetricType,
    type ApiQueryResults,
    type Field,
    type FieldId,
    type Item,
    type ItemsMap,
    type ResultRow,
    type TableCalculation,
} from '@lightdash/common';
import { useMemo } from 'react';

type Args = {
    resultsData: ApiQueryResults | undefined;
    itemsMap: Record<FieldId, Field | TableCalculation>;
};

export const isSummable = (item: Item | undefined) => {
    if (!item) {
        return false;
    }

    if (isTableCalculation(item)) {
        return false;
    }
    if (isCustomDimension(item)) {
        return false;
    }
    const numericTypes: string[] = [
        DimensionType.NUMBER,
        MetricType.NUMBER,
        MetricType.COUNT,
        MetricType.SUM,
    ];
    const isPercent = item.format === 'percent';
    const isDatePart = isDimension(item) && item.timeInterval;
    return numericTypes.includes(item.type) && !isPercent && !isDatePart;
};

const getResultColumnTotals = (
    rows: ResultRow[],
    keys: Array<string>,
): Record<FieldId, number | undefined> => {
    if (keys.length > 0) {
        return rows.reduce<Record<FieldId, number | undefined>>((acc, row) => {
            keys.forEach((key) => {
                if (row[key]) {
                    acc[key] = (acc[key] || 0) + Number(row[key].value.raw);
                }
            });
            return acc;
        }, {});
    }
    return {};
};

const getResultColumnTotalsFromItemsMap = (
    rows: ResultRow[],
    itemsMap: ItemsMap,
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
