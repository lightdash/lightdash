import concat from 'lodash/concat';
import flatMap from 'lodash/flatMap';
import intersection from 'lodash/intersection';
import mapValues from 'lodash/mapValues';
import pickBy from 'lodash/pickBy';

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

function checkIfExploreFieldsHasMatchingTags<E extends FilterableExplore>(
    explore: E,
    availableTags: string[],
) {
    const fields = concat(
        flatMap(explore.tables, (t) => Object.values(t.metrics)),
        flatMap(explore.tables, (t) => Object.values(t.dimensions)),
    );

    return hasMatchingTags(
        flatMap(fields, (f) => f.tags ?? []),
        availableTags,
    );
}

function checkIfExploreHasMatchingTags<E extends FilterableExplore>(
    explore: E,
    availableTags: string[],
) {
    if (hasMatchingTags(explore.tags, availableTags)) {
        return true;
    }

    if (checkIfExploreFieldsHasMatchingTags(explore, availableTags)) {
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
    if (availableTags === null) return explore;

    if (!checkIfExploreHasMatchingTags(explore, availableTags)) {
        return undefined;
    }

    if (!checkIfExploreFieldsHasMatchingTags(explore, availableTags)) {
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
