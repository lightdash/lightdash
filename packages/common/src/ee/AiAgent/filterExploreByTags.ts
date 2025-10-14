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

function matcher(tags: string[], availableTags: string[]) {
    return intersection(tags, availableTags).length > 0;
}

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

function hasTableAnyFieldTags<T extends FilterableTable>(table: T) {
    const allFields = concat(
        Object.values(table.metrics),
        Object.values(table.dimensions),
    );
    return allFields.some((field) => field.tags !== undefined);
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
 * **Field-Level Mode** (if table has ANY field with tags defined):
 * - Expose only fields where field.tags matches availableTags
 * - Empty tags arrays (tags: []) activate this mode but match nothing
 *
 * **Explore-Level Mode** (if table has NO fields with tags defined):
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
 * | No explore tag, base table fields tagged        | Only matching fields visible              |
 * | No explore tag, only joined table fields tagged | Explore hidden (base table requirement)   |
 * | No matching tags anywhere                       | Explore hidden                            |
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
            if (hasTableAnyFieldTags(table)) {
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
