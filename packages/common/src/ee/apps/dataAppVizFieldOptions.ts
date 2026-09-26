import { type ConditionalFormattingMinMaxMap } from '../../types/conditionalFormatting';
import {
    type DataAppVizFieldMapping,
    type DataAppVizFieldOptionValues,
} from '../../types/savedCharts';
import { getConditionalFormattingMinMaxMap } from '../../utils/conditionalFormatting';
import { getDataAppVizFieldIds } from './dataAppVizFieldMapping';
import {
    getEffectiveOptionValues,
    pruneDataAppVizOptionValues,
    toDataAppVizContextOptionValue,
    type DataAppVizContext,
    type DataAppVizField,
} from './types';

/**
 * The stored per-field values that still fit the contract and binding: fields
 * no longer bound, options no longer declared and mistyped values go.
 */
export const pruneDataAppVizFieldOptionValues = (
    fields: DataAppVizField[],
    fieldMapping: DataAppVizFieldMapping,
    fieldOptionValues: DataAppVizFieldOptionValues,
): DataAppVizFieldOptionValues =>
    Object.fromEntries(
        fields.flatMap((field) => {
            const kept = Object.fromEntries(
                getDataAppVizFieldIds(fieldMapping[field.name]).flatMap(
                    (fieldId) => {
                        const values = pruneDataAppVizOptionValues(
                            field.configOptions ?? [],
                            fieldOptionValues[field.name]?.[fieldId] ?? {},
                        );
                        return Object.keys(values).length > 0
                            ? [[fieldId, values] as const]
                            : [];
                    },
                ),
            );
            return Object.keys(kept).length > 0
                ? [[field.name, kept] as const]
                : [];
        }),
    );

// Per-field numeric range: pivoted metrics span their pivot columns, index
// dimensions use their own column, and series dimensions (no column) get none.
export const getDataAppVizMinMaxMap = ({
    fieldIds,
    rows,
    pivotDetails,
    convertValue,
}: Parameters<
    typeof getConditionalFormattingMinMaxMap
>[0]): ConditionalFormattingMinMaxMap => {
    const pivotedFieldIds = new Set(
        pivotDetails?.valuesColumns.map((col) => col.referenceField) ?? [],
    );
    return {
        ...getConditionalFormattingMinMaxMap({
            rows,
            fieldIds: fieldIds.filter((id) => !pivotedFieldIds.has(id)),
            pivotDetails: null,
            convertValue,
        }),
        ...getConditionalFormattingMinMaxMap({
            rows,
            fieldIds: fieldIds.filter((id) => pivotedFieldIds.has(id)),
            pivotDetails,
            convertValue,
        }),
    };
};

/**
 * Per-field values as delivered to the chart: the stored value, else the
 * declared default, for every field bound to an input that declares options.
 * 'auto' gradient bounds become the smallest and largest value of that field
 * in the rows (see getDataAppVizMinMaxMap), or null when it has none.
 */
export const getDataAppVizFieldOptions = (
    fields: DataAppVizField[],
    fieldMapping: DataAppVizFieldMapping,
    fieldOptionValues: DataAppVizFieldOptionValues,
    data: Pick<DataAppVizContext, 'rows' | 'pivotDetails'>,
): DataAppVizContext['fieldOptions'] => {
    const fieldsWithOptions = fields.filter(
        (field) => (field.configOptions ?? []).length > 0,
    );
    const gradientFieldIds = fieldsWithOptions
        .filter((field) =>
            field.configOptions?.some((option) => option.type === 'gradient'),
        )
        .flatMap((field) => getDataAppVizFieldIds(fieldMapping[field.name]));
    const minMaxMap =
        gradientFieldIds.length > 0
            ? getDataAppVizMinMaxMap({
                  fieldIds: gradientFieldIds,
                  rows: data.rows,
                  pivotDetails: data.pivotDetails,
                  convertValue: (_fieldId, value) => value,
              })
            : {};

    return Object.fromEntries(
        fieldsWithOptions.map((field) => [
            field.name,
            Object.fromEntries(
                getDataAppVizFieldIds(fieldMapping[field.name]).map(
                    (fieldId) => [
                        fieldId,
                        Object.fromEntries(
                            Object.entries(
                                getEffectiveOptionValues(
                                    field.configOptions ?? [],
                                    fieldOptionValues[field.name]?.[fieldId] ??
                                        {},
                                ),
                            ).map(([name, value]) => [
                                name,
                                toDataAppVizContextOptionValue(
                                    value,
                                    minMaxMap[fieldId] ?? null,
                                ),
                            ]),
                        ),
                    ],
                ),
            ),
        ]),
    );
};
