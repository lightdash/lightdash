import { deriveDataAppVizPivotConfig } from '../../pivot/deriveDataAppVizPivotConfig';
import {
    ConditionalFormattingColorApplyTo,
    isConditionalFormattingConfigWithSingleColor,
    isConditionalFormattingWithCompareTarget,
    type ConditionalFormattingColorRange,
    type ConditionalFormattingConfig,
    type ConditionalFormattingMinMax,
    type ConditionalFormattingRowFields,
} from '../../types/conditionalFormatting';
import { type ItemsMap } from '../../types/field';
import { type ResultRow } from '../../types/results';
import { type DataAppVizFieldMapping } from '../../types/savedCharts';
import { getGradientColor, isHexCodeColor } from '../../utils/colors';
import {
    convertFormattedValue,
    getConditionalFormattingColor,
    getConditionalFormattingConfig,
} from '../../utils/conditionalFormatting';
import { isNumericItem } from '../../utils/item';
import { type PivotValuesColumn } from '../../visualizations/types';
import { getDataAppVizFieldIds } from './dataAppVizFieldMapping';
import { getDataAppVizMinMaxMap } from './dataAppVizFieldOptions';
import { type DataAppVizSchema } from './types';

/** Bound numeric fields rules can target; series fields have no column once pivoted. */
export const getDataAppVizConditionalFormattingFieldIds = (
    schema: Pick<DataAppVizSchema, 'fields' | 'conditionalFormatting'>,
    fieldMapping: DataAppVizFieldMapping,
    itemsMap: ItemsMap,
): string[] => {
    if (!schema.conditionalFormatting) return [];
    const seriesFieldIds = new Set(
        deriveDataAppVizPivotConfig(schema.fields, fieldMapping)?.columns ?? [],
    );
    return [
        ...new Set(
            schema.fields.flatMap((field) =>
                getDataAppVizFieldIds(fieldMapping[field.name]),
            ),
        ),
    ].filter(
        (fieldId) =>
            !seriesFieldIds.has(fieldId) && isNumericItem(itemsMap[fieldId]),
    );
};

// Custom charts have no text to style, so text styling is dropped.
const withoutTextStyle = ({
    textStyle: _textStyle,
    ...config
}: ConditionalFormattingConfig): ConditionalFormattingConfig => config;

/** Rules that still fit the binding; conditions on unbound fields go. */
export const pruneDataAppVizConditionalFormattings = (
    conditionalFormattings: ConditionalFormattingConfig[],
    fieldIds: string[],
): ConditionalFormattingConfig[] => {
    if (fieldIds.length === 0) return [];
    const bound = new Set(fieldIds);
    return conditionalFormattings.flatMap<ConditionalFormattingConfig>(
        (stored) => {
            const config = withoutTextStyle(stored);
            if (config.target && !bound.has(config.target.fieldId)) return [];
            if (!isConditionalFormattingConfigWithSingleColor(config)) {
                return [config];
            }
            const rules = config.rules.filter(
                (rule) =>
                    !isConditionalFormattingWithCompareTarget(rule) ||
                    !rule.compareTarget ||
                    bound.has(rule.compareTarget.fieldId),
            );
            if (rules.length === config.rules.length) return [config];
            return rules.length > 0 ? [{ ...config, rules }] : [];
        },
    );
};

// The table's colour-range contract, interpolated in oklab like gradients.
const getOklabColorFromRange = (
    value: number,
    colorRange: ConditionalFormattingColorRange,
    { min, max }: ConditionalFormattingMinMax,
): string | undefined => {
    if (
        !isHexCodeColor(colorRange.start) ||
        !isHexCodeColor(colorRange.end) ||
        min > max ||
        value < min ||
        value > max
    ) {
        return undefined;
    }
    return (
        getGradientColor(
            { colors: [colorRange.start, colorRange.end], min, max },
            value,
        ) ?? undefined
    );
};

/**
 * Per row, column name → colour of each cell a rule matched. Pivoted metrics
 * compare within their pivot column; unpivoted index dimensions join every one.
 */
export const getDataAppVizConditionalFormattingColors = ({
    schema,
    fieldMapping,
    itemsMap,
    conditionalFormattings,
    rows,
    pivotDetails,
    adjustColorRange,
}: {
    schema: Pick<DataAppVizSchema, 'fields' | 'conditionalFormatting'>;
    fieldMapping: DataAppVizFieldMapping;
    itemsMap: ItemsMap;
    conditionalFormattings: ConditionalFormattingConfig[];
    rows: ResultRow[];
    pivotDetails: {
        valuesColumns: Pick<
            PivotValuesColumn,
            'referenceField' | 'pivotColumnName' | 'pivotValues'
        >[];
    } | null;
    /** The host's colour scheme adjustment, as built-in tables apply it. */
    adjustColorRange: (
        colorRange: ConditionalFormattingColorRange,
    ) => ConditionalFormattingColorRange;
}): Array<Record<string, string>> => {
    const fieldIds = getDataAppVizConditionalFormattingFieldIds(
        schema,
        fieldMapping,
        itemsMap,
    );
    if (conditionalFormattings.length === 0 || fieldIds.length === 0) {
        return [];
    }

    const pivotedFieldIds = new Set(
        pivotDetails?.valuesColumns.map((column) => column.referenceField) ??
            [],
    );
    const pivotDimensionIds = new Set(
        pivotDetails?.valuesColumns.flatMap((column) =>
            column.pivotValues.map(({ referenceField }) => referenceField),
        ) ?? [],
    );
    const indexFieldIds = fieldIds.filter(
        (fieldId) =>
            !pivotedFieldIds.has(fieldId) && !pivotDimensionIds.has(fieldId),
    );
    const valueColumns = (pivotDetails?.valuesColumns ?? [])
        .filter((column) => fieldIds.includes(column.referenceField))
        .map((column) => ({
            fieldId: column.referenceField,
            columnName: column.pivotColumnName,
            pivotKey: JSON.stringify(
                column.pivotValues.map(({ referenceField, value }) => [
                    referenceField,
                    value,
                ]),
            ),
        }));

    const minMaxMap = getDataAppVizMinMaxMap({
        fieldIds,
        rows,
        pivotDetails,
        convertValue: (fieldId, value) =>
            convertFormattedValue(value, itemsMap[fieldId]),
    });
    const getColorFromRange = (
        value: number,
        colorRange: ConditionalFormattingColorRange,
        minMax: ConditionalFormattingMinMax,
    ) => getOklabColorFromRange(value, adjustColorRange(colorRange), minMax);

    return rows.map((row) => {
        const indexRowFields: ConditionalFormattingRowFields =
            Object.fromEntries(
                indexFieldIds.map((fieldId) => [
                    fieldId,
                    {
                        field: itemsMap[fieldId],
                        value: row[fieldId]?.value?.raw,
                    },
                ]),
            );
        const rowFieldsByPivotKey = new Map<
            string,
            ConditionalFormattingRowFields
        >();
        for (const { fieldId, columnName, pivotKey } of valueColumns) {
            const rowFields = rowFieldsByPivotKey.get(pivotKey) ?? {
                ...indexRowFields,
            };
            rowFields[fieldId] = {
                field: itemsMap[fieldId],
                value: row[columnName]?.value?.raw,
            };
            rowFieldsByPivotKey.set(pivotKey, rowFields);
        }
        const cells = [
            ...indexFieldIds.map((fieldId) => ({
                fieldId,
                columnName: fieldId,
                rowFields: indexRowFields,
            })),
            ...valueColumns.map(({ fieldId, columnName, pivotKey }) => ({
                fieldId,
                columnName,
                rowFields: rowFieldsByPivotKey.get(pivotKey),
            })),
        ];

        const colors: Record<string, string> = {};
        for (const { fieldId, columnName, rowFields } of cells) {
            const field = itemsMap[fieldId];
            const value = row[columnName]?.value?.raw;
            const config = getConditionalFormattingConfig({
                field,
                value,
                minMaxMap,
                conditionalFormattings,
                rowFields,
                // Like table cells: row and text rules never colour a cell.
                applyTo: ConditionalFormattingColorApplyTo.CELL,
            });
            const result = getConditionalFormattingColor({
                field,
                value,
                config,
                minMaxMap,
                getColorFromRange,
            });
            if (result) colors[columnName] = result.color;
        }
        return colors;
    });
};
