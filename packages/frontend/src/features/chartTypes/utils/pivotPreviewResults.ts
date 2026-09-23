import {
    deriveDataAppVizPivotConfig,
    DimensionType,
    getDataAppVizFieldIds,
    getItemType,
    getPivotValueColumnName,
    getResultColumnMetadataFromItem,
    getColumnAxisType,
    isDimension,
    isCustomDimension,
    isMetric,
    isTableCalculation,
    VizAggregationOptions,
    type DataAppVizFieldMapping,
    type DataAppVizSchema,
    type ItemsMap,
    type Item,
    type PivotValuesColumn,
    type ReadyQueryResultsPage,
    type ResultRow,
} from '@lightdash/common';

const getColumnType = (item: Item): DimensionType => {
    const type = getItemType(item);
    switch (type) {
        case DimensionType.DATE:
        case DimensionType.TIMESTAMP:
        case DimensionType.STRING:
        case DimensionType.BOOLEAN:
            return type;
        default:
            return DimensionType.NUMBER;
    }
};

type PreviewResults = Pick<ReadyQueryResultsPage, 'rows' | 'pivotDetails'>;

/** Pivot the bounded preview by the current bindings, independently of its source chart. */
export const pivotPreviewResults = ({
    schema,
    fieldMapping,
    itemsMap,
    rows,
    pivotDetails,
}: PreviewResults & {
    schema: DataAppVizSchema;
    fieldMapping: DataAppVizFieldMapping;
    itemsMap: ItemsMap;
}): PreviewResults => {
    const series =
        deriveDataAppVizPivotConfig(
            schema.fields,
            fieldMapping,
        )?.columns.filter(
            (id) =>
                itemsMap[id] &&
                (isDimension(itemsMap[id]) || isCustomDimension(itemsMap[id])),
        ) ?? [];
    const values = [
        ...new Set(Object.values(fieldMapping).flatMap(getDataAppVizFieldIds)),
    ].filter(
        (id) =>
            itemsMap[id] &&
            (isMetric(itemsMap[id]) || isTableCalculation(itemsMap[id])),
    );
    if (pivotDetails || series.length === 0 || values.length === 0) {
        return { rows, pivotDetails };
    }

    // Retain extra query dimensions so a saved chart never loses distinct groups.
    const indexes = Object.keys(itemsMap).filter(
        (id) =>
            !series.includes(id) &&
            (isDimension(itemsMap[id]) || isCustomDimension(itemsMap[id])),
    );
    const groupedRows = new Map<string, ResultRow>();
    const groups = new Map<string, number>();
    const columns = new Map<string, PivotValuesColumn>();
    const emptyCell = () => ({ value: { raw: null, formatted: '' } });
    for (const source of rows) {
        const indexKey = JSON.stringify(
            indexes.map((id) => source[id]?.value.raw ?? null),
        );
        const seriesValues = series.map((id) => source[id]?.value.raw ?? null);
        const groupKey = JSON.stringify(seriesValues);
        if (!groups.has(groupKey)) groups.set(groupKey, groups.size + 1);
        let row = groupedRows.get(indexKey);
        if (!row) {
            row = Object.fromEntries(
                indexes.map((id) => [id, source[id] ?? emptyCell()]),
            );
            groupedRows.set(indexKey, row);
        }
        for (const id of values) {
            const name = getPivotValueColumnName(
                id,
                VizAggregationOptions.ANY,
                seriesValues,
            );
            if (!columns.has(name))
                columns.set(name, {
                    referenceField: id,
                    pivotColumnName: name,
                    aggregation: VizAggregationOptions.ANY,
                    pivotValues: series.map((referenceField, i) => ({
                        referenceField,
                        value: seriesValues[i],
                        formatted:
                            source[referenceField]?.value.formatted ?? '',
                    })),
                    columnIndex: groups.get(groupKey)!,
                });
            // Match the custom chart's ANY aggregation when groups repeat.
            row[name] ??= source[id] ?? emptyCell();
        }
    }
    const pivotedRows = [...groupedRows.values()];
    for (const row of pivotedRows) {
        for (const name of columns.keys()) row[name] ??= emptyCell();
    }
    return {
        rows: pivotedRows,
        pivotDetails: {
            totalColumnCount: columns.size,
            valuesColumns: [...columns.values()],
            indexColumn: indexes.map((reference) => ({
                reference,
                type: getColumnAxisType(getColumnType(itemsMap[reference])),
            })),
            groupByColumns: series.map((reference) => ({ reference })),
            sortBy: undefined,
            originalColumns: Object.fromEntries(
                Object.entries(itemsMap).map(([reference, item]) => [
                    reference,
                    {
                        reference,
                        type: getColumnType(item),
                        ...getResultColumnMetadataFromItem(item, reference),
                    },
                ]),
            ),
        },
    };
};
