import { type ItemsMap } from '../types/field';
import {
    type MergeFieldOrigin,
    type MergeFieldOrigins,
} from '../types/mergeQuery';
import { getItemId } from './item';

/** One merged column, as the field it presents to everything downstream. */
export type MergeItemEntry = {
    /** Column the merged statement returns. */
    column: string;
    item: ItemsMap[string];
    origin: MergeFieldOrigin;
};

/**
 * Turns merged columns into an ordinary items map, so formatting, sorting,
 * chart configuration and saving treat a merged result like any other result
 * instead of growing a second code path for it.
 *
 * Keying by `getItemId` is what makes that true: every viz lookup round-trips
 * an id through it, so a map keyed any other way silently misses.
 */
export const buildMergeItems = (
    entries: MergeItemEntry[],
): {
    itemsMap: ItemsMap;
    fieldOrigins: MergeFieldOrigins;
    fieldIdByColumn: Record<string, string>;
} => {
    const itemsMap: ItemsMap = {};
    const fieldOrigins: MergeFieldOrigins = {};
    const fieldIdByColumn: Record<string, string> = {};

    entries.forEach(({ column, item, origin }) => {
        const fieldId = getItemId(item);
        if (itemsMap[fieldId] !== undefined) {
            throw new Error(
                `Two merged columns resolve to the field id "${fieldId}". One would replace the other and its column would vanish from the result.`,
            );
        }
        itemsMap[fieldId] = item;
        fieldOrigins[fieldId] = origin;
        fieldIdByColumn[column] = fieldId;
    });

    return { itemsMap, fieldOrigins, fieldIdByColumn };
};
