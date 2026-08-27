import {
    assertUnreachable,
    type DataAppReadDataReferences,
    type DataAppReadExploreReferences,
    type PersistedDataAppDataReferences,
} from '@lightdash/common';

const pushUnique = (target: string[], values: string[]) => {
    for (const value of values) {
        if (!target.includes(value)) target.push(value);
    }
};

const emptyExplore = (name: string): DataAppReadExploreReferences => ({
    name,
    dimensions: [],
    metrics: [],
    filterFields: [],
    sortFields: [],
    parameterKeys: [],
    localFields: [],
    customSqlFieldCount: 0,
});

/**
 * Collapses per-call-site references into the per-explore summary the agent
 * reads. Source locations and custom SQL text are dropped; charts whose uuid
 * is missing from `chartSlugsByUuid` (deleted) are dropped.
 */
export const aggregateDataAppDataReferences = (
    { references, stats }: PersistedDataAppDataReferences,
    chartSlugsByUuid: ReadonlyMap<string, string>,
): DataAppReadDataReferences => {
    const explores = new Map<string, DataAppReadExploreReferences>();
    const linkedCharts = new Map<string, string[]>();
    const externalConnections = new Map<string, string[]>();
    const unresolved = new Set<string>();

    const exploreFor = (name: string) => {
        const existing = explores.get(name);
        if (existing) return existing;
        const created = emptyExplore(name);
        explores.set(name, created);
        return created;
    };

    for (const ref of references) {
        ref.unresolved.forEach((part) => unresolved.add(part));
        switch (ref.kind) {
            case 'query': {
                if (ref.explore === null) break;
                const explore = exploreFor(ref.explore);
                pushUnique(explore.dimensions, ref.dimensions);
                pushUnique(explore.metrics, ref.metrics);
                pushUnique(explore.filterFields, [
                    ...ref.dimensionFilterFields,
                    ...ref.metricFilterFields,
                ]);
                pushUnique(explore.sortFields, ref.sortFields);
                pushUnique(explore.parameterKeys, ref.parameterKeys);
                pushUnique(explore.localFields, ref.localFields);
                if (ref.customSql) {
                    explore.customSqlFieldCount +=
                        ref.customSql.tableCalculations.length +
                        ref.customSql.customDimensions.length +
                        ref.customSql.additionalMetrics.length;
                }
                break;
            }
            case 'globalFilter': {
                if (ref.explore === null) break;
                const fields = ref.fields ?? (ref.field ? [ref.field] : []);
                pushUnique(exploreFor(ref.explore).filterFields, fields);
                break;
            }
            case 'savedChart': {
                const slug =
                    ref.chartUuid === null
                        ? undefined
                        : chartSlugsByUuid.get(ref.chartUuid);
                if (slug === undefined) break;
                const filterFields = linkedCharts.get(slug) ?? [];
                pushUnique(filterFields, ref.filterFields);
                linkedCharts.set(slug, filterFields);
                break;
            }
            case 'externalFetch': {
                if (ref.alias === null) break;
                const paths = externalConnections.get(ref.alias) ?? [];
                if (ref.path !== null) pushUnique(paths, [ref.path]);
                externalConnections.set(ref.alias, paths);
                break;
            }
            default:
                assertUnreachable(ref, 'Unknown data reference kind');
        }
    }

    return {
        explores: [...explores.values()],
        linkedCharts: [...linkedCharts].map(([slug, filterFields]) => ({
            slug,
            filterFields,
        })),
        externalConnections: [...externalConnections].map(([alias, paths]) => ({
            alias,
            paths,
        })),
        stats,
        unresolved: [...unresolved].sort(),
    };
};
