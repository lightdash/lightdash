import {
    concat,
    flatMap,
    intersection,
    mapValues,
    pickBy,
} from 'es-toolkit/compat';
import type { ExploreType } from '../../types/explore';

type FilterableTable = {
    dimensions: Record<string, { tags?: string[] }>;
    metrics: Record<string, { tags?: string[] }>;
};

type FilterableExplore<T extends FilterableTable = FilterableTable> = {
    type?: ExploreType;
    tags: string[];
    baseTable: string;
    tables: { [tableName: string]: T };
};

function matcher(tags: string[], availableTags: string[]) {
    return intersection(tags, availableTags).length > 0;
}

/**
 * Whether something carrying these tags is open to an agent limited to
 * `availableTags`. An agent without tags is limited to nothing.
 */
export const isTaggedForAgent = (
    tags: string[] | null | undefined,
    availableTags: string[] | null,
): boolean =>
    !availableTags ||
    availableTags.length === 0 ||
    matcher(tags ?? [], availableTags);

function hasFieldMatchingTags<T extends FilterableTable>(
    table: T,
    availableTags: string[],
) {
    return matcher(
        concat(
            flatMap(table.metrics, (m) => m.tags ?? []),
            flatMap(table.dimensions, (d) => d.tags ?? []),
        ),
        availableTags,
    );
}

function hasMatchingTags<
    E extends FilterableExplore,
    T extends FilterableTable,
>(explore: E, baseTable: T, availableTags: string[]) {
    if (matcher(explore.tags, availableTags)) {
        return true;
    }

    if (hasFieldMatchingTags(baseTable, availableTags)) {
        return true;
    }

    return false;
}

/**
 * @description
 * Filters an explore based on available tags configured in AI settings.
 *
 * ## Base Table Requirement
 * An explore is only visible if the base table has matching tags at either:
 * - Explore level (explore.tags matches availableTags), OR
 * - Field level (at least one base table field has matching tags)
 *
 * ## Per-Table Filtering Modes
 * Each table in the explore is filtered independently:
 *
 * **Field-Level Mode** (if any field in the table has a tag from availableTags):
 * - Expose only fields where field.tags matches availableTags
 *
 * **Explore-Level Mode** (if no field in the table has a tag from availableTags):
 * - Field tags that are not in availableTags (unrelated or excluded tags, or
 *   an empty tags array) do not switch the table to field-level mode
 * - If explore.tags matches → expose ALL fields in this table
 * - If explore.tags doesn't match → expose NO fields (empty dimensions/metrics)
 *
 * ## Tagging Scenarios
 *
 * | Scenario                                        | Result                                    |
 * |-------------------------------------------------|-------------------------------------------|
 * | No tags configured (availableTags = null/[])    | Everything is visible                     |
 * | Explore tagged, no field tags                   | All tables/fields visible (explore-level) |
 * | Explore tagged, some fields tagged              | Per-table: field-level or explore-level   |
 * | Explore tagged, fields carry only other tags    | All fields visible (explore-level)        |
 * | No explore tag, base table fields tagged        | Only matching fields visible              |
 * | No explore tag, only joined table fields tagged | Explore hidden (base table requirement)   |
 * | No matching tags anywhere                       | Explore hidden                            |
 *
 * Live data source explores carry their source's tags at explore level, so
 * they follow the same rules as dbt explores.
 */
export function filterExploreByTags<E extends FilterableExplore>({
    explore,
    availableTags,
}: {
    explore: E;
    availableTags: string[] | null;
}) {
    if (!availableTags || availableTags.length === 0) {
        return explore;
    }

    const baseTable = explore.tables[explore.baseTable];
    if (!baseTable) {
        throw new Error(`Base table not found`);
    }

    if (!hasMatchingTags(explore, baseTable, availableTags)) {
        return undefined;
    }

    // Apply per-table filtering logic
    const filteredExplore: E = {
        ...explore,
        tables: mapValues(explore.tables, (table) => {
            if (hasFieldMatchingTags(table, availableTags)) {
                // Field-level tagging mode: expose only fields with matching tags
                return {
                    ...table,
                    dimensions: pickBy(table.dimensions, (d) =>
                        matcher(d.tags ?? [], availableTags),
                    ),
                    metrics: pickBy(table.metrics, (m) =>
                        matcher(m.tags ?? [], availableTags),
                    ),
                };
            }

            // Explore-level tagging mode
            if (matcher(explore.tags, availableTags)) {
                // Explore tagged: expose all fields in this table
                return table;
            }

            // Explore not tagged: expose no fields
            return {
                ...table,
                dimensions: {},
                metrics: {},
            };
        }),
    };

    return filteredExplore;
}
