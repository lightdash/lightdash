import { concat, flatMap, intersection, mapValues, pickBy } from 'lodash';

type FilterableTable = {
    dimensions: Record<string, { tags?: string[] }>;
    metrics: Record<string, { tags?: string[] }>;
};

type FilterableExplore<T extends FilterableTable = FilterableTable> = {
    tags: string[];
    baseTable: string;
    tables: { [tableName: string]: T };
};

function hasMatchingTags(tags: string[], availableTags: string[]) {
    return intersection(tags, availableTags).length > 0;
}

function checkIfTableFieldsHasMatchingTags<T extends FilterableTable>(
    table: T,
    availableTags: string[],
) {
    return hasMatchingTags(
        concat(
            flatMap(table.metrics, (m) => m.tags ?? []),
            flatMap(table.dimensions, (d) => d.tags ?? []),
        ),
        availableTags,
    );
}

function checkIfExploreHasMatchingTags<
    E extends FilterableExplore,
    T extends FilterableTable,
>(e: E, baseTable: T, availableTags: string[]) {
    if (hasMatchingTags(e.tags, availableTags)) {
        return true;
    }

    if (checkIfTableFieldsHasMatchingTags(baseTable, availableTags)) {
        return true;
    }

    return false;
}

/**
 * @description
 *
 * No tags are configured in settings UI:
 *
 * | Tagging Scenario                  | AI Visibility                    |
 * |-----------------------------------|----------------------------------|
 * | No tags configured in settings UI | Everything is visible by default |
 *
 * ---
 *
 * Tags are configured in settings UI:
 *
 * | Tagging Scenario                     | AI Visibility               |
 * |--------------------------------------|-----------------------------|
 * | Explore only (with matching tag)     | All fields in the Explore   |
 * | Some fields only (with matching tag) | Only those tagged fields    |
 * | Explore + some fields (with match)   | Only those tagged fields    |
 * | No matching tags                     | Nothing is visible          |
 */
export function filterExploreByTags<E extends FilterableExplore>({
    explore,
    availableTags,
}: {
    explore: E;
    availableTags: string[] | null;
}) {
    if (!availableTags) {
        return explore;
    }

    const baseTable = explore.tables[explore.baseTable];
    if (!baseTable) {
        throw new Error(`Base table not found`);
    }

    if (!checkIfExploreHasMatchingTags(explore, baseTable, availableTags)) {
        return undefined;
    }

    if (!checkIfTableFieldsHasMatchingTags(baseTable, availableTags)) {
        return explore;
    }

    const filteredExplore: E = {
        ...explore,
        tables: mapValues(explore.tables, (table) => ({
            ...table,
            dimensions: pickBy(table.dimensions, (d) =>
                hasMatchingTags(d.tags ?? [], availableTags),
            ),
            metrics: pickBy(table.metrics, (m) =>
                hasMatchingTags(m.tags ?? [], availableTags),
            ),
        })),
    };

    return filteredExplore;
}
