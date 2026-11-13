/**
 * Field search for explores the data catalog doesn't index: external sources
 * and live data sources. Their compiled explores load once a search starts
 * and their fields match on the page. A live explore holds only the fields
 * in use, so that is all the search finds for it.
 */
import { type Explore as CompiledExplore } from '@lightdash/common';
import { type FieldMatch, type Kind, type Project } from './model';

const UNCATALOGUED_KINDS: ReadonlySet<Kind> = new Set(['files', 'live']);

/** Explores whose fields the data catalog search can't find. */
export const uncataloguedExploreIds = (project: Project): string[] => {
    const sourceIds = new Set(
        project.sources
            .filter(({ kind }) => UNCATALOGUED_KINDS.has(kind))
            .map(({ id }) => id),
    );
    return project.explores
        .filter(({ sourceId }) => sourceIds.has(sourceId))
        .map(({ id }) => id);
};

/** Visible fields of each explore's base table whose label or name contains the text. */
export const matchExploreFields = (
    explores: CompiledExplore[],
    query: string,
): FieldMatch[] => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return explores.flatMap((explore) => {
        const table = explore.tables[explore.baseTable];
        if (!table) return [];
        const dimensions = Object.values(table.dimensions).filter(
            // Time intervals (created_at_month, ...) belong to their base.
            (dimension) =>
                !dimension.hidden && !dimension.timeIntervalBaseDimensionName,
        );
        const metrics = Object.values(table.metrics).filter(
            (metric) => !metric.hidden,
        );
        return [...dimensions, ...metrics]
            .filter(
                ({ name, label }) =>
                    label.toLowerCase().includes(needle) ||
                    name.toLowerCase().includes(needle),
            )
            .map(
                (item): FieldMatch => ({
                    name: item.name,
                    label: item.label,
                    tableName: item.table,
                    exploreId: explore.name,
                    fieldType:
                        item.fieldType === 'metric' ? 'metric' : 'dimension',
                }),
            );
    });
};
