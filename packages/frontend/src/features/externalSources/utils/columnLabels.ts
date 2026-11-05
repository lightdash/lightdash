import { friendlyName, type ResultColumns } from '@lightdash/common';

export const initialColumnLabels = (
    columns: ResultColumns,
): Record<string, string> =>
    Object.fromEntries(
        Object.values(columns).map((column) => [
            column.reference,
            column.label ?? friendlyName(column.reference),
        ]),
    );

export const hasCustomColumnLabels = (labels: Record<string, string>) =>
    Object.entries(labels).some(
        ([reference, label]) => label.trim() !== friendlyName(reference),
    );
