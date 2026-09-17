import {
    getDataAppVizFieldIds,
    isResultValue,
    type DataAppVizFieldMapping,
    type ResultValue,
} from '@lightdash/common';

/** A viz click intent as it crosses the untrusted iframe boundary. */
export type VizIntent = {
    row: Record<string, unknown>;
    metric: string;
    fieldId?: string;
};

export const isVizIntent = (input: unknown): input is VizIntent =>
    typeof input === 'object' &&
    input !== null &&
    typeof (input as { metric?: unknown }).metric === 'string' &&
    typeof (input as { row?: unknown }).row === 'object' &&
    (input as { row?: unknown }).row !== null &&
    ((input as { fieldId?: unknown }).fieldId === undefined ||
        typeof (input as { fieldId?: unknown }).fieldId === 'string');

/** Resolves a clicked metric slot, requiring an explicit member for multi slots. */
export const resolveVizFieldId = (
    intent: VizIntent,
    fieldMapping: DataAppVizFieldMapping,
): string => {
    const fieldIds = getDataAppVizFieldIds(fieldMapping[intent.metric]);
    if (intent.fieldId !== undefined) {
        if (fieldIds.includes(intent.fieldId)) return intent.fieldId;
        throw new Error(
            `"${intent.fieldId}" is not bound to "${intent.metric}" on this chart.`,
        );
    }
    if (fieldIds.length === 1) return fieldIds[0];
    if (fieldIds.length === 0) {
        throw new Error(
            `"${intent.metric}" is not bound to a query field on this chart.`,
        );
    }
    throw new Error(
        `"${intent.metric}" has multiple fields; choose a bound field id.`,
    );
};

// ResultRow cells → the { raw, formatted } fieldValues the shared builders
// consume; cells failing strict ResultValue validation are skipped (untrusted iframe boundary).
export const toVizFieldValues = (
    row: Record<string, unknown>,
): Record<string, ResultValue> =>
    Object.fromEntries(
        Object.entries(row).flatMap(([id, cell]) =>
            isResultValue(cell) ? [[id, cell.value]] : [],
        ),
    );
