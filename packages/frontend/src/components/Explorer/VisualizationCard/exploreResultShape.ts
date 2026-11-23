import {
    getItemLabelWithoutTableName,
    isCustomDimension,
    isDateItem,
    isDimension,
    isMetric,
    isTableCalculation,
    MetricType,
    type ChartResultShape,
    type ChartShapeValue,
    type CustomFormat,
    type ItemsMap,
    type MetricQuery,
    type ResultRow,
} from '@lightdash/common';

const COUNT_TYPES: string[] = [MetricType.COUNT, MetricType.COUNT_DISTINCT];

const formatUnit = (format: CustomFormat | undefined) =>
    format ? `${format.type}:${format.currency ?? ''}` : null;

const getValueUnit = (item: ItemsMap[string] | undefined): string | null => {
    if (!item) return null;
    if (isMetric(item)) {
        return (
            formatUnit(item.formatOptions) ??
            (COUNT_TYPES.includes(item.type) ? 'count' : null)
        );
    }
    if (isTableCalculation(item)) return formatUnit(item.format);
    return null;
};

const toValue = (fieldId: string, itemsMap: ItemsMap): ChartShapeValue => {
    const item = itemsMap[fieldId];
    return {
        fieldId,
        label: item ? getItemLabelWithoutTableName(item) : fieldId,
        unit: getValueUnit(item),
    };
};

/** The shape of loaded Explore results that `recommendChart` reads. */
export const getExploreResultShape = ({
    metricQuery,
    rows,
    totalResults,
    itemsMap,
}: {
    metricQuery: MetricQuery;
    rows: ResultRow[];
    totalResults: number | undefined;
    itemsMap: ItemsMap;
}): ChartResultShape => ({
    dimensions: metricQuery.dimensions.map((fieldId) => {
        const item = itemsMap[fieldId];
        return {
            fieldId,
            label: item ? getItemLabelWithoutTableName(item) : fieldId,
            isTime:
                !!item &&
                !isCustomDimension(item) &&
                isDimension(item) &&
                isDateItem(item),
            distinctValueCount: new Set(
                rows.map((row) => row[fieldId]?.value.raw),
            ).size,
            longestValueLength: rows.reduce(
                (longest, row) =>
                    Math.max(
                        longest,
                        String(row[fieldId]?.value.formatted ?? '').length,
                    ),
                0,
            ),
        };
    }),
    metrics: metricQuery.metrics.map((fieldId) => toValue(fieldId, itemsMap)),
    tableCalculations: metricQuery.tableCalculations.map(({ name }) =>
        toValue(name, itemsMap),
    ),
    rowCount: totalResults ?? rows.length,
});
