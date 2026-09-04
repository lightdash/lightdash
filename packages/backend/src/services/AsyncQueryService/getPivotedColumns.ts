import {
    assertUnreachable,
    convertItemTypeToDimensionType,
    DimensionType,
    getResultColumnMetadataFromItem,
    getResultColumnSourceItem,
    isMetric,
    MetricType,
    normalizeIndexColumns,
    VizAggregationOptions,
    type Item,
    type ItemsMap,
    type ParametersValuesMap,
    type PivotValuesColumn,
    type QueryHistory,
    type ResultColumns,
} from '@lightdash/common';

// Returns the type of a pivoted value column. Numeric aggregations always
// produce NUMBER, regardless of what they aggregate. Value-picking
// aggregations keep the source item's type; MIN and MAX metrics report their
// base dimension's type, because the metric's own type maps to NUMBER, which
// is incorrect for temporal bases. Columns without a resolvable source item
// keep the NUMBER fallback.
function getPivotedValueColumnType(
    item: Item | undefined,
    aggregation: VizAggregationOptions,
): DimensionType {
    switch (aggregation) {
        case VizAggregationOptions.COUNT:
        case VizAggregationOptions.SUM:
        case VizAggregationOptions.AVERAGE:
            return DimensionType.NUMBER;
        case VizAggregationOptions.MIN:
        case VizAggregationOptions.MAX:
        case VizAggregationOptions.ANY: {
            if (!item) return DimensionType.NUMBER;
            if (
                isMetric(item) &&
                (item.type === MetricType.MIN ||
                    item.type === MetricType.MAX) &&
                item.baseDimensionType
            ) {
                return item.baseDimensionType;
            }
            return convertItemTypeToDimensionType(item);
        }
        default:
            return assertUnreachable(
                aggregation,
                `Unknown pivot aggregation ${aggregation}`,
            );
    }
}

export function getPivotedColumns(
    unpivotedColumns: ResultColumns,
    pivotConfiguration: NonNullable<QueryHistory['pivotConfiguration']>,
    pivotValuesColumns: PivotValuesColumn[],
    itemsMap?: ItemsMap,
    usedParameters?: ParametersValuesMap | null,
): ResultColumns {
    const { indexColumn, passthroughDimensions } = pivotConfiguration;
    const indexColumns = normalizeIndexColumns(indexColumn);

    // Create an object with all index columns
    const indexColumnsResult = indexColumns.reduce(
        (acc, { reference }) => ({
            ...acc,
            [reference]: unpivotedColumns[reference],
        }),
        {} as ResultColumns,
    );

    // Include passthrough dimensions so their per-row values survive the
    // streaming pipeline and reach the frontend, where cross-field richText /
    // image templates resolve `row.<table>.<field>.raw` via TanStack's
    // (visibility-hidden) column cells.
    //
    // Skip passthrough refs that aren't present in unpivotedColumns —
    // writing `undefined` into ResultColumns would lie about the column
    // shape and could crash downstream consumers that assume entries are
    // truthy. The dim is still carried on each row by AsyncQueryService's
    // row transformer, so the lookup is templates-only; losing the column
    // metadata entry just means the field isn't listed in the columns map.
    const passthroughColumnsResult = (passthroughDimensions ?? []).reduce(
        (acc, { reference }) => {
            const col = unpivotedColumns[reference];
            if (col === undefined) return acc;
            return { ...acc, [reference]: col };
        },
        {} as ResultColumns,
    );

    return {
        ...indexColumnsResult,
        ...passthroughColumnsResult,
        ...pivotValuesColumns.reduce<ResultColumns>((acc, valueColumn) => {
            // Shared resolution rule: metadata and the type derivation must
            // read the same source item, or they diverge.
            const sourceItem = getResultColumnSourceItem(
                itemsMap,
                valueColumn.referenceField,
            );
            const metadata = getResultColumnMetadataFromItem(
                sourceItem,
                valueColumn.referenceField,
                usedParameters,
            );
            // Compose the label from the source metric's label and the
            // (already formatted) pivot values, mirroring how the frontend
            // joins pivot values with ' - ' for series names.
            const pivotValuesLabel = valueColumn.pivotValues
                .map(
                    (pivotValue) =>
                        pivotValue.formatted ?? String(pivotValue.value),
                )
                .join(' - ');
            if (metadata.label && pivotValuesLabel) {
                metadata.label = `${metadata.label} - ${pivotValuesLabel}`;
            }
            acc[valueColumn.pivotColumnName] = {
                reference: valueColumn.pivotColumnName,
                type: getPivotedValueColumnType(
                    sourceItem,
                    valueColumn.aggregation,
                ),
                ...metadata,
            };
            return acc;
        }, {}),
    };
}
