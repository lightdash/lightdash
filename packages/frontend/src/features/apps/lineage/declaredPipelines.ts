import {
    friendlyName,
    QuerySourceType,
    type DataAppManifestComposerNode,
    type DataAppManifestQuery,
    type DataAppManifestSemanticSpec,
    type DataAppManifestSlot,
    type DataAppManifestValue,
    type DataAppQueryManifest,
    type MetricQueryRequest,
    type SemanticLayerSourceQuery,
    type SourceQuery,
} from '@lightdash/common';
import { SINGLE_NODE_ID, type DataAppPipeline } from './dataAppPipelines';

type Resolved =
    | string
    | number
    | boolean
    | null
    | Resolved[]
    | { [key: string]: Resolved };

const isRecord = (
    value: Resolved | undefined,
): value is Record<string, Resolved> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** `{slot}`, `{template}` and `{source}` stand in for values unknown at build time. */
const markerOf = (
    value: DataAppManifestValue,
): { kind: 'slot' | 'template' | 'source'; text: string } | null => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }
    const entries = Object.entries(value);
    if (entries.length !== 1) return null;
    const [[key, text]] = entries;
    if (typeof text !== 'string') return null;
    return key === 'slot' || key === 'template' || key === 'source'
        ? { kind: key, text }
        : null;
};

/** A manifest value at default state: slots take their defaults, unfoldable values drop out. */
const atDefaults = (
    value: DataAppManifestValue,
    slots: DataAppManifestSlot[],
): Resolved | undefined => {
    const defaultOf = (name: string): Resolved | undefined => {
        const slot = slots.find((s) => s.name === name);
        return slot ? atDefaults(slot.default, []) : undefined;
    };
    const marker = markerOf(value);
    if (marker) {
        switch (marker.kind) {
            case 'slot':
                return defaultOf(marker.text);
            case 'template': {
                let resolved = true;
                const text = marker.text.replace(
                    /\$\{(\w+)\}/g,
                    (_match, name: string) => {
                        const fill = defaultOf(name);
                        if (
                            typeof fill === 'string' ||
                            typeof fill === 'number'
                        ) {
                            return String(fill);
                        }
                        resolved = false;
                        return '';
                    },
                );
                return resolved ? text : undefined;
            }
            case 'source':
                return undefined;
            default:
                return undefined;
        }
    }
    if (Array.isArray(value)) {
        // A slot inside a list (e.g. `.filters(filtersFor(x))`) spreads its default.
        return value.flatMap((item) => {
            const resolved = atDefaults(item, slots);
            if (resolved === undefined) return [];
            return markerOf(item)?.kind === 'slot' && Array.isArray(resolved)
                ? resolved
                : [resolved];
        });
    }
    if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(
            Object.entries(value).flatMap(([key, item]) => {
                const resolved = atDefaults(item, slots);
                return resolved === undefined ? [] : [[key, resolved]];
            }),
        );
    }
    return value;
};

const asString = (value: Resolved | undefined): string | null =>
    typeof value === 'string' ? value : null;

const asNumber = (value: Resolved | undefined): number | null =>
    typeof value === 'number' ? value : null;

const asList = (value: Resolved | undefined): Resolved[] =>
    Array.isArray(value) ? value : [];

const asStrings = (value: Resolved | undefined): string[] =>
    asList(value).filter((item) => typeof item === 'string');

/** Best-effort `<table>_<field>`; the SDK resolves the real base table when it runs. */
const qualify = (explore: string, field: string): string => {
    if (field.includes('.')) return field.replace(/\./g, '_');
    if (explore === '' || field.startsWith(`${explore}_`)) return field;
    return `${explore}_${field}`;
};

const toFilterGroup = (
    filters: Resolved[],
    explore: string,
    rootId: string,
) => ({
    id: rootId,
    and: filters.flatMap((filter, index) => {
        if (
            !isRecord(filter) ||
            typeof filter.field !== 'string' ||
            typeof filter.operator !== 'string'
        ) {
            return [];
        }
        const { value, unit } = filter;
        return [
            {
                id: `${rootId}-${index}`,
                target: { fieldId: qualify(explore, filter.field) },
                operator: filter.operator,
                values:
                    value === undefined
                        ? []
                        : asList(Array.isArray(value) ? value : [value]),
                ...(typeof unit === 'string'
                    ? { settings: { unitOfTime: unit } }
                    : {}),
            },
        ];
    }),
});

type NodeMeta = { nodeId: string; title: string; description: string | null };

/** A node whose explore is unknown statically (saved chart, unfoldable source). */
const opaqueSemanticNode = (node: NodeMeta): SemanticLayerSourceQuery => ({
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: node.nodeId,
    title: node.title,
    description: node.description ?? undefined,
    exploreName: '',
    dimensions: [],
    metrics: [],
});

const semanticNode = (
    spec: DataAppManifestSemanticSpec,
    slots: DataAppManifestSlot[],
    node: NodeMeta,
): SemanticLayerSourceQuery => {
    const explore = asString(atDefaults(spec.explore, slots)) ?? '';
    const fields = (values: DataAppManifestValue[]) =>
        asStrings(atDefaults(values, slots)).map((f) => qualify(explore, f));
    const dimensionFilters = asList(atDefaults(spec.filters, slots));
    const metricFilters = asList(atDefaults(spec.metricFilters, slots));
    const limit = asNumber(atDefaults(spec.limit, slots));
    return {
        ...opaqueSemanticNode(node),
        exploreName: explore,
        dimensions: fields(spec.dimensions),
        metrics: fields(spec.metrics),
        // Same shape the bridge reports for a query that ran.
        filters: {
            ...(dimensionFilters.length > 0
                ? {
                      dimensions: toFilterGroup(
                          dimensionFilters,
                          explore,
                          'declared',
                      ),
                  }
                : {}),
            ...(metricFilters.length > 0
                ? {
                      metrics: toFilterGroup(
                          metricFilters,
                          explore,
                          'declared-metric',
                      ),
                  }
                : {}),
        } as MetricQueryRequest['filters'],
        sorts: asList(atDefaults(spec.sorts, slots)).flatMap((sort) =>
            isRecord(sort) && typeof sort.field === 'string'
                ? [
                      {
                          fieldId: qualify(explore, sort.field),
                          descending: sort.direction === 'desc',
                      },
                  ]
                : [],
        ),
        limit: limit !== null && limit > 0 ? limit : undefined,
    };
};

const composerNode = (
    node: DataAppManifestComposerNode,
    slots: DataAppManifestSlot[],
): { query: SourceQuery; savedChart: boolean } | null => {
    const nodeId = asString(atDefaults(node.nodeId, slots));
    if (nodeId === null) return null;
    const meta: NodeMeta = {
        nodeId,
        title: asString(atDefaults(node.title, slots)) ?? nodeId,
        description: asString(atDefaults(node.description, slots)),
    };
    switch (node.kind) {
        case 'semantic': {
            const { query } = node;
            if (query === null || !('kind' in query)) {
                return { query: opaqueSemanticNode(meta), savedChart: false };
            }
            return query.kind === 'savedChart'
                ? { query: opaqueSemanticNode(meta), savedChart: true }
                : {
                      query: semanticNode(query, slots, meta),
                      savedChart: false,
                  };
        }
        case 'duckdb':
            return {
                query: {
                    sourceType: QuerySourceType.DUCKDB,
                    nodeId,
                    title: meta.title,
                    description: meta.description ?? undefined,
                    sql: asString(atDefaults(node.sql, slots)) ?? '',
                    references: asStrings(atDefaults(node.reads, slots)),
                    limit: asNumber(atDefaults(node.limit, slots)) ?? undefined,
                },
                savedChart: false,
            };
        case 'python':
            return {
                query: {
                    sourceType: QuerySourceType.PYTHON,
                    nodeId,
                    title: meta.title,
                    description: meta.description ?? undefined,
                    code: asString(atDefaults(node.code, slots)) ?? '',
                    references: asStrings(atDefaults(node.reads, slots)),
                    limit: asNumber(atDefaults(node.limit, slots)) ?? undefined,
                },
                savedChart: false,
            };
        default:
            return null;
    }
};

/** Stable across reloads: the manifest locates each query by its source line. */
export const declaredPipelineId = (query: DataAppManifestQuery): string =>
    `declared:${query.loc}`;

const declaredTitle = (query: DataAppManifestQuery): string => {
    if (query.title !== null) return query.title;
    if (query.id !== null) return query.id;
    const explore =
        query.kind === 'semantic'
            ? asString(atDefaults(query.explore, query.slots))
            : null;
    return explore ? friendlyName(explore) : query.loc;
};

/** A manifest query at default state, as a lineage entry that has not run. */
export const toDeclaredPipeline = (
    query: DataAppManifestQuery,
): DataAppPipeline | null => {
    const base = {
        id: declaredPipelineId(query),
        queryId: query.id,
        title: declaredTitle(query),
        description: query.description,
        status: 'ready' as const,
        error: null,
        rowCount: null,
        durationMs: null,
        timestamp: 0,
        nodeQueryUuids: {},
        declared: query,
        hasRun: false,
    };
    const single: NodeMeta = {
        nodeId: SINGLE_NODE_ID,
        title: base.title,
        description: query.description,
    };
    switch (query.kind) {
        case 'semantic':
            return {
                ...base,
                kind: 'query',
                queries: [semanticNode(query, query.slots, single)],
                terminalNodeId: SINGLE_NODE_ID,
                savedChartNodeIds: [],
            };
        case 'savedChart':
            return {
                ...base,
                kind: 'query',
                queries: [opaqueSemanticNode(single)],
                terminalNodeId: SINGLE_NODE_ID,
                savedChartNodeIds: [SINGLE_NODE_ID],
            };
        case 'composer': {
            const nodes = query.nodes.flatMap((node) => {
                const converted = composerNode(node, query.slots);
                return converted ? [converted] : [];
            });
            const lastNodeId = nodes[nodes.length - 1]?.query.nodeId;
            const terminalNodeId =
                asString(atDefaults(query.terminal, query.slots)) ?? lastNodeId;
            if (terminalNodeId === undefined) return null;
            return {
                ...base,
                kind: 'composer',
                queries: nodes.map((node) => node.query),
                terminalNodeId,
                savedChartNodeIds: nodes.flatMap((node) =>
                    node.savedChart && node.query.nodeId
                        ? [node.query.nodeId]
                        : [],
                ),
            };
        }
        default:
            return null;
    }
};

/**
 * Lineage entries with the build-time manifest folded in: runs gain their
 * declaration, and declared queries the app has not run yet are listed first
 * (oldest). Author query ids link the two, so unnamed queries are left out.
 */
export const withDeclaredQueries = (
    pipelines: DataAppPipeline[],
    manifest: DataAppQueryManifest | null,
): DataAppPipeline[] => {
    if (!manifest) return pipelines;
    const declaredById = new Map(
        manifest.queries.flatMap((q) => (q.id !== null ? [[q.id, q]] : [])),
    );
    const ranIds = new Set(pipelines.map((p) => p.queryId));
    const notRun = [...declaredById.values()].flatMap((query) => {
        if (ranIds.has(query.id)) return [];
        const pipeline = toDeclaredPipeline(query);
        return pipeline ? [pipeline] : [];
    });
    return [
        ...notRun,
        ...pipelines.map((pipeline) => ({
            ...pipeline,
            declared:
                pipeline.queryId !== null
                    ? (declaredById.get(pipeline.queryId) ?? null)
                    : null,
        })),
    ];
};
