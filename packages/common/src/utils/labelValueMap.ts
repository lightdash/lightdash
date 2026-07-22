import { type ResultRow } from '../types/results';
import { type PivotValuesColumn } from '../visualizations/types';

export type LabelValueMap = Record<string, Record<string, string>>;

export const buildLabelValueMap = (
    rows: ResultRow[],
    labelDimensionMap: Record<string, string> | undefined,
): LabelValueMap => {
    if (!labelDimensionMap || Object.keys(labelDimensionMap).length === 0) {
        return {};
    }
    const result: LabelValueMap = {};
    for (const [idFieldId, labelFieldId] of Object.entries(labelDimensionMap)) {
        const byRawValue: Record<string, string> = {};
        for (const row of rows) {
            const rawValue = row[idFieldId]?.value?.raw;
            if (rawValue !== undefined && rawValue !== null) {
                const rawKey = String(rawValue);
                const label = row[labelFieldId]?.value?.formatted;
                if (byRawValue[rawKey] === undefined && label !== undefined) {
                    byRawValue[rawKey] = label;
                }
            }
        }
        result[idFieldId] = byRawValue;
    }
    return result;
};

// Pivoted results drop the group-by dimension from each row, so
// buildLabelValueMap (which reads row[idField]) yields nothing for legend
// series. The companion label is instead carried on each pivot column value.
export const buildLabelValueMapFromPivotValues = (
    valuesColumns: PivotValuesColumn[] | undefined,
): LabelValueMap => {
    const result: LabelValueMap = {};
    if (!valuesColumns) {
        return result;
    }
    for (const column of valuesColumns) {
        for (const { label, value, referenceField } of column.pivotValues) {
            if (label !== undefined && value !== undefined && value !== null) {
                const byRawValue = result[referenceField] ?? {};
                const rawKey = String(value);
                if (byRawValue[rawKey] === undefined) {
                    byRawValue[rawKey] = label;
                }
                result[referenceField] = byRawValue;
            }
        }
    }
    return result;
};

export const mergeLabelValueMaps = (
    ...maps: LabelValueMap[]
): LabelValueMap => {
    const result: LabelValueMap = {};
    for (const map of maps) {
        for (const [fieldId, byRawValue] of Object.entries(map)) {
            result[fieldId] = { ...(result[fieldId] ?? {}), ...byRawValue };
        }
    }
    return result;
};

export const getLabelForValue = (
    labelValueMap: LabelValueMap | undefined,
    fieldId: string,
    value: unknown,
): string | undefined => {
    if (value === undefined || value === null) {
        return undefined;
    }
    return labelValueMap?.[fieldId]?.[String(value)];
};
