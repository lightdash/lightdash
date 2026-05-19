import { FieldType, type PivotData } from '@lightdash/common';

export type PivotPin = {
    reference: string;
    rawValue: unknown;
    formatted: string;
};

export type PivotColumnIdentity = {
    /** undefined when metricsAsRows: true. */
    metricFieldId: string | undefined;
    pivotValues: PivotPin[];
};

/** -1 when metricsAsRows: true. */
export const getMetricLabelHeaderRowIndex = (data: PivotData): number => {
    for (let i = data.headerValueTypes.length - 1; i >= 0; i -= 1) {
        if (data.headerValueTypes[i].type === FieldType.METRIC) return i;
    }
    return -1;
};

// Each header-row cell maps 1:1 with a data column (merged cells carry the
// owner's payload with colSpan=0) — index directly, never by colSpan cursor.
export const getPivotColumnIdentities = (
    data: PivotData,
): PivotColumnIdentity[] => {
    const dataColumnCount = data.dataColumnCount ?? 0;
    const metricLabelRowIndex = getMetricLabelHeaderRowIndex(data);
    const identities: PivotColumnIdentity[] = Array.from(
        { length: dataColumnCount },
        () => ({ metricFieldId: undefined, pivotValues: [] }),
    );

    for (let rowIdx = 0; rowIdx < data.headerValues.length; rowIdx += 1) {
        const headerRow = data.headerValues[rowIdx];
        const limit = Math.min(headerRow.length, dataColumnCount);
        for (let colIdx = 0; colIdx < limit; colIdx += 1) {
            const cell = headerRow[colIdx];
            if (cell.type === 'value') {
                const raw = cell.value?.raw;
                identities[colIdx].pivotValues.push({
                    reference: cell.fieldId,
                    rawValue: raw,
                    formatted:
                        cell.value?.formatted ??
                        (raw === undefined || raw === null ? '' : String(raw)),
                });
            } else if (
                cell.type === 'label' &&
                rowIdx === metricLabelRowIndex
            ) {
                identities[colIdx].metricFieldId = cell.fieldId;
            }
        }
    }
    return identities;
};
