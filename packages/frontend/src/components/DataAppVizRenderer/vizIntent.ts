import { isResultValue, type ResultValue } from '@lightdash/common';

/** A viz click intent as it crosses the untrusted iframe boundary. */
export type VizIntent = {
    row: Record<string, unknown>;
    metric: string;
};

export const isVizIntent = (input: unknown): input is VizIntent =>
    typeof input === 'object' &&
    input !== null &&
    typeof (input as { metric?: unknown }).metric === 'string' &&
    typeof (input as { row?: unknown }).row === 'object' &&
    (input as { row?: unknown }).row !== null;

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
