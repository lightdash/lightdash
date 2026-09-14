import {
    getItemId,
    isField,
    type ItemsMap,
    type ResultValue,
} from '@lightdash/common';

/** `row.<table>.<field>` values a templated URL can reference. */
export type TemplatedUrlRow = Record<string, Record<string, ResultValue>>;

export type TemplatedUrlRowContext = {
    /** Item ids present in the row, used to validate `row.*` references. */
    itemIdsInRow: string[];
    row: TemplatedUrlRow;
};

export type GetTemplatedUrlItem = (
    fieldId: string,
) => ItemsMap[string] | undefined;

/**
 * Builds the row context for a set of `fieldId -> value` pairs so it can be
 * shared by any table that already knows which fields sit on a "row".
 */
export const buildTemplatedUrlRowContext = (
    fieldValues: Record<string, ResultValue | undefined>,
    getItem: GetTemplatedUrlItem,
): TemplatedUrlRowContext => {
    const itemIdsInRow: string[] = [];
    const row: TemplatedUrlRow = {};
    Object.entries(fieldValues).forEach(([fieldId, value]) => {
        const item = getItem(fieldId);
        if (!item || !isField(item) || !value) return;
        itemIdsInRow.push(getItemId(item));
        row[item.table] = row[item.table] || {};
        row[item.table][item.name] = value;
    });
    return { itemIdsInRow, row };
};
