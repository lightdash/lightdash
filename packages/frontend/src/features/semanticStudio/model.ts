/**
 * Data model for the semantic layer page: the project's sources, their
 * explores and the tree and search built from them. Built from the real
 * explores in realProject.ts; fields load per explore in useExploreFields.ts.
 */
import { getItemId, type ApiConnectorType } from '@lightdash/common';
import { type ChangeKind } from './modelCode';

export type Kind = 'modelled' | 'sqlViews' | 'files' | 'live';

const KIND_ORDER: Kind[] = ['modelled', 'sqlViews', 'files', 'live'];

/**
 * Names match the rest of the product: "Warehouse" for the semantic layer,
 * "Virtual views" from the Explore sidebar, "External sources" and "Live
 * data sources" from settings.
 */
const KIND_LABELS: Record<Exclude<Kind, 'modelled'>, string> = {
    sqlViews: 'Virtual views',
    files: 'External sources',
    live: 'Live data sources',
};

/** The warehouse a source runs on, if it runs on one. */
export const sourceWarehouse = (
    project: Project,
    { onWarehouse }: Source,
): WarehouseConnection | undefined =>
    onWarehouse ? project.warehouse : undefined;

/** Under Warehouse, the semantic layer is named after the warehouse type. */
const sourceLabel = (project: Project, source: Source): string => {
    const warehouse =
        source.kind === 'modelled'
            ? sourceWarehouse(project, source)
            : undefined;
    return warehouse ? warehouse.label : source.name;
};

const kindLabel = (project: Project, kind: Kind): string =>
    kind === 'modelled'
        ? project.warehouse
            ? 'Warehouse'
            : 'dbt project'
        : KIND_LABELS[kind];

export type SourceType = 'dbt' | 'sqlView' | 'csv' | 'sheets' | 'live';

export type WarehouseConnection = {
    /** WarehouseTypes value, such as `bigquery`. */
    type: string;
    /** How the product names it, such as BigQuery. */
    label: string;
};

export type Source = {
    id: string;
    kind: Kind;
    type: SourceType;
    name: string;
    /** Where it is defined, in words: a repository, an upload, an integration. */
    origin: string;
    /** Queries run on the project warehouse (the semantic layer, virtual views). */
    onWarehouse: boolean;
    /** A problem to show, such as a failed refresh. */
    status: string | null;
    integration?: ApiConnectorType;
    /** The live data source's connection, for saving its fields. */
    connectionUuid?: string;
    /** Its settings page; null when it has none. */
    settingsPath: string | null;
};

export type Explore = {
    /** The explore name, as in /tables/:name. */
    id: string;
    name: string;
    label: string;
    sourceId: string;
    /** YAML `groups` path; empty when the explore is ungrouped. */
    groupPath: string[];
    description: string;
    warnings: string[];
};

export type FieldKind = 'dimension' | 'metric';

export type Field = {
    /** The field id, `<table>_<name>`. */
    id: string;
    name: string;
    label: string;
    fieldKind: FieldKind;
    type: string;
    table: string;
    tableLabel: string;
    description: string;
    aiHint: string;
    group: string;
    /** Only live data sources turn fields on and off. */
    inUse: boolean;
    definition: { label: string; value: string };
    /** User attributes needed to see it, in words; null for everyone. */
    visibleTo: string | null;
    isInternal: boolean;
    /** Every query of a live data source needs it; it stays in use. */
    isRequired: boolean;
    /** Charts using it; only live data sources report it. */
    chartUsage: number | null;
    lastEdit: { by: string; at: string } | null;
    /** What this person's draft does to it; null when it leaves it alone. */
    draftState: ChangeKind | null;
};

export type Project = {
    id: string;
    name: string;
    warehouse: WarehouseConnection | undefined;
    sources: Source[];
    explores: Explore[];
};

const RULE_LINE = /^\s{0,3}([-=*_])(\s*\1){2,}\s*$/;
const ATX_HEADING = /^\s{0,3}#{1,6}\s+/;

const toSummary = (markdown: string): string => {
    // Blocks of text in order; rules and tables are dropped.
    const blocks: { text: string; heading: boolean }[] = [];
    let lines: string[] = [];
    const flush = (heading: boolean) => {
        if (lines.length > 0) blocks.push({ text: lines.join(' '), heading });
        lines = [];
    };
    for (const line of markdown.trim().split('\n')) {
        if (RULE_LINE.test(line)) {
            // `Title` over `---` or `===` is a heading, otherwise a rule.
            flush(/^\s*[-=]/.test(line));
        } else if (ATX_HEADING.test(line)) {
            flush(false);
            blocks.push({ text: line.replace(ATX_HEADING, ''), heading: true });
        } else if (!line.trim() || /^\s*\|/.test(line)) {
            flush(false);
        } else {
            lines.push(line);
        }
    }
    flush(false);
    // A leading heading is a title; the summary is what follows it.
    const [first, second] = blocks;
    const pick = first?.heading && second ? second : first;
    return (pick?.text ?? '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/!?\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/(\*\*|__|\*|_)(\S[^*_]*?)\1/g, '$2')
        .replace(/\s+/g, ' ')
        .trim();
};

// Thousands of rows share a few descriptions; each is parsed once.
const SUMMARY_CACHE_LIMIT = 10_000;
const summaries = new Map<string, string>();

/**
 * The first paragraph of a markdown description as plain text, for one-line
 * cells. A leading heading counts as a title and is skipped; rules and tables
 * stay in the details.
 */
export const summaryOf = (markdown: string): string => {
    if (!markdown) return '';
    const cached = summaries.get(markdown);
    if (cached !== undefined) return cached;
    if (summaries.size >= SUMMARY_CACHE_LIMIT) summaries.clear();
    const summary = toSummary(markdown);
    summaries.set(markdown, summary);
    return summary;
};

/** The groups an explore's fields are in, to pick from when moving one. */
export const fieldGroups = (fields: Field[]): string[] =>
    [...new Set(fields.map(({ group }) => group.trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
    );

// ---------------------------------------------------------------------------
// Lookups

export const getSource = (project: Project, sourceId: string): Source => {
    const source = project.sources.find(({ id }) => id === sourceId);
    if (!source) throw new Error(`Unknown source ${sourceId}`);
    return source;
};

export const getExplore = (project: Project, exploreId: string): Explore => {
    const explore = project.explores.find(({ id }) => id === exploreId);
    if (!explore) throw new Error(`Unknown explore ${exploreId}`);
    return explore;
};

/**
 * Whether a link still points at something in this project. A field link is
 * checked once its explore's fields load.
 */
export const refExists = (project: Project, ref: NodeRef | null): boolean => {
    if (!ref) return true;
    switch (ref.type) {
        case 'kind':
            return project.sources.some(({ kind }) => kind === ref.kind);
        case 'source':
        case 'group':
            return project.sources.some(({ id }) => id === ref.sourceId);
        case 'explore':
        case 'field':
            return project.explores.some(({ id }) => id === ref.exploreId);
        default:
            return false;
    }
};

// ---------------------------------------------------------------------------
// Tree

export type NodeRef =
    | { type: 'kind'; kind: Kind }
    | { type: 'source'; sourceId: string }
    | { type: 'group'; sourceId: string; path: string[] }
    | { type: 'explore'; exploreId: string }
    | { type: 'field'; exploreId: string; fieldId: string };

export type TreeNode = {
    key: string;
    ref: NodeRef;
    label: string;
    exploreCount: number;
    children: TreeNode[];
    /** Breadcrumb labels down to this node (skipped levels excluded). */
    path: string[];
};

export const nodeKey = (ref: NodeRef): string => {
    switch (ref.type) {
        case 'kind':
            return `kind:${ref.kind}`;
        case 'source':
            return `source:${ref.sourceId}`;
        case 'group':
            // Encoded so a group named "a/b" never meets group a's child b.
            return `group:${ref.sourceId}:${ref.path.map(encodeURIComponent).join('/')}`;
        case 'explore':
            return `explore:${ref.exploreId}`;
        case 'field':
            return `field:${ref.exploreId}:${ref.fieldId}`;
        default:
            return '';
    }
};

const sortByLabel = (a: TreeNode, b: TreeNode) => {
    const aGroup = a.ref.type === 'group' ? 0 : 1;
    const bGroup = b.ref.type === 'group' ? 0 : 1;
    if (aGroup !== bGroup) return aGroup - bGroup;
    return a.label.localeCompare(b.label);
};

const buildSourceChildren = (
    source: Source,
    explores: Explore[],
    parentPath: string[],
): TreeNode[] => {
    const root: TreeNode[] = [];
    const groupIndex = new Map<string, TreeNode>();

    for (const explore of explores) {
        let siblings = root;
        let path = parentPath;
        explore.groupPath.forEach((label, depth) => {
            const ref: NodeRef = {
                type: 'group',
                sourceId: source.id,
                path: explore.groupPath.slice(0, depth + 1),
            };
            const key = nodeKey(ref);
            path = [...path, label];
            let group = groupIndex.get(key);
            if (!group) {
                group = {
                    key,
                    ref,
                    label,
                    exploreCount: 0,
                    children: [],
                    path,
                };
                groupIndex.set(key, group);
                siblings.push(group);
            }
            group.exploreCount += 1;
            siblings = group.children;
        });
        const ref: NodeRef = { type: 'explore', exploreId: explore.id };
        siblings.push({
            key: nodeKey(ref),
            ref,
            label: explore.label,
            exploreCount: 1,
            children: [],
            path: [...path, explore.label],
        });
    }

    const sortDeep = (nodes: TreeNode[]) => {
        nodes.sort(sortByLabel);
        for (const node of nodes) sortDeep(node.children);
    };
    sortDeep(root);
    return root;
};

export type ProjectTree = {
    nodes: TreeNode[];
    /** The project's only source, when its level was skipped at the top. */
    rootSource: Source | null;
};

/**
 * Kind > Source > Group > Explore, leaving out a Kind or Source level that
 * has a single child, so a one-source project opens straight on its groups.
 * Warehouse always keeps its level: Warehouse > BigQuery > folders.
 */
export const buildProjectTree = (project: Project): ProjectTree => {
    const { explores } = project;
    const kindNodes: TreeNode[] = [];
    for (const kind of KIND_ORDER) {
        const sources = project.sources.filter(
            (source) =>
                source.kind === kind &&
                explores.some(({ sourceId }) => sourceId === source.id),
        );
        if (sources.length === 0) continue;
        const kindRef: NodeRef = { type: 'kind', kind };
        const kindPath = [kindLabel(project, kind)];
        const sourceNodes: TreeNode[] = sources.map((source) => {
            const sourceExplores = explores.filter(
                ({ sourceId }) => sourceId === source.id,
            );
            const ref: NodeRef = { type: 'source', sourceId: source.id };
            const label = sourceLabel(project, source);
            const path = [...kindPath, label];
            return {
                key: nodeKey(ref),
                ref,
                label,
                exploreCount: sourceExplores.length,
                children: buildSourceChildren(source, sourceExplores, path),
                path,
            };
        });
        kindNodes.push({
            key: nodeKey(kindRef),
            ref: kindRef,
            label: kindLabel(project, kind),
            exploreCount: sourceNodes.reduce(
                (sum, { exploreCount }) => sum + exploreCount,
                0,
            ),
            children: sourceNodes,
            path: kindPath,
        });
    }

    const simplify = (node: TreeNode): TreeNode => {
        if (node.ref.type !== 'kind') return node;
        const children =
            node.children.length === 1 && node.ref.kind !== 'modelled'
                ? node.children[0].children
                : node.children.map((child) =>
                      // A source with one explore shows the explore itself.
                      child.ref.type === 'source' &&
                      child.children.length === 1 &&
                      child.children[0].ref.type === 'explore'
                          ? child.children[0]
                          : child,
                  );
        // Sources by name, so a refetch never reshuffles them.
        return { ...node, children: [...children].sort(sortByLabel) };
    };
    const assignPaths = (nodes: TreeNode[], parent: string[]): TreeNode[] =>
        nodes.map((node) => {
            const path = [...parent, node.label];
            return {
                ...node,
                path,
                children: assignPaths(node.children, path),
            };
        });

    let rootSource: Source | null = null;
    let nodes = kindNodes.map(simplify);
    if (nodes.length === 1 && nodes[0].ref.type === 'kind') {
        const { kind } = nodes[0].ref;
        nodes = nodes[0].children;
        const onlySources = project.sources.filter(
            (source) =>
                source.kind === kind &&
                explores.some(({ sourceId }) => sourceId === source.id),
        );
        if (onlySources.length === 1) [rootSource] = onlySources;
    }
    if (nodes.length === 1 && nodes[0].ref.type === 'source') {
        rootSource = getSource(project, nodes[0].ref.sourceId);
        nodes = nodes[0].children;
    }
    return { nodes: assignPaths(nodes, []), rootSource };
};

/**
 * Where a link should land: a source the tree folds into its only explore
 * opens that explore.
 */
export const resolveRef = (
    project: Project,
    nodes: TreeNode[],
    ref: NodeRef | null,
): NodeRef | null => {
    if (!ref || ref.type !== 'source') return ref;
    if (findNode(nodes, nodeKey(ref))) return ref;
    const explores = project.explores.filter(
        ({ sourceId }) => sourceId === ref.sourceId,
    );
    return explores.length === 1
        ? { type: 'explore', exploreId: explores[0].id }
        : ref;
};

/**
 * What a page lists: its node's children or, for a level the tree folded
 * away, the children of the level that took its place. A page with nothing
 * to list (a live data source with no explores yet) lists nothing.
 */
export const pageNodes = (
    project: Project,
    tree: ProjectTree,
    ref: NodeRef | null,
): TreeNode[] => {
    if (!ref) return tree.nodes;
    const node = findNode(tree.nodes, nodeKey(ref));
    if (node) return node.children;
    const withExplores = project.sources.filter((source) =>
        project.explores.some(({ sourceId }) => sourceId === source.id),
    );
    const foldedAtRoot = !tree.nodes.some(
        ({ ref: { type } }) => type === 'kind',
    );
    if (ref.type === 'kind') {
        return foldedAtRoot &&
            withExplores.some(({ kind }) => kind === ref.kind)
            ? tree.nodes
            : [];
    }
    if (ref.type !== 'source') return [];
    if (tree.rootSource?.id === ref.sourceId) return tree.nodes;
    const source = withExplores.find(({ id }) => id === ref.sourceId);
    if (!source) return [];
    const siblings = withExplores.filter(({ kind }) => kind === source.kind);
    const kindNode = findNode(
        tree.nodes,
        nodeKey({ type: 'kind', kind: source.kind }),
    );
    if (siblings.length === 1 && kindNode) return kindNode.children;
    return foldedAtRoot && siblings.length === 1 ? tree.nodes : [];
};

/** Flattens the expanded part of a tree into rows for a virtual list. */
export type TreeRow = { node: TreeNode; depth: number };

export const flattenTree = (
    nodes: TreeNode[],
    expanded: Set<string>,
    depth = 0,
    rows: TreeRow[] = [],
): TreeRow[] => {
    for (const node of nodes) {
        rows.push({ node, depth });
        if (node.children.length > 0 && expanded.has(node.key)) {
            flattenTree(node.children, expanded, depth + 1, rows);
        }
    }
    return rows;
};

export function findNode(nodes: TreeNode[], key: string): TreeNode | undefined {
    for (const node of nodes) {
        if (node.key === key) return node;
        const found = findNode(node.children, key);
        if (found) return found;
    }
    return undefined;
}

/** Keys of every ancestor of a node, so selecting it can expand its parents. */
export const ancestorKeys = (nodes: TreeNode[], key: string): string[] => {
    const walk = (list: TreeNode[], trail: string[]): string[] | null => {
        for (const node of list) {
            if (node.key === key) return trail;
            const found = walk(node.children, [...trail, node.key]);
            if (found) return found;
        }
        return null;
    };
    return walk(nodes, []) ?? [];
};

/** The node and its ancestors, root first: the path a selection opens. */
export const trailTo = (nodes: TreeNode[], key: string): TreeNode[] => {
    const node = findNode(nodes, key);
    if (!node) return [];
    const ancestors = ancestorKeys(nodes, key)
        .map((ancestorKey) => findNode(nodes, ancestorKey))
        .filter((ancestor): ancestor is TreeNode => ancestor !== undefined);
    return [...ancestors, node];
};

/** A field selection lives inside its explore. */
export const containerOf = (ref: NodeRef): NodeRef =>
    ref.type === 'field' ? { type: 'explore', exploreId: ref.exploreId } : ref;

// ---------------------------------------------------------------------------
// Search: flat results with their path

export type SearchGroup = 'Sources' | 'Folders' | 'Explores' | 'Fields';

const SEARCH_GROUPS: readonly SearchGroup[] = [
    'Sources',
    'Folders',
    'Explores',
    'Fields',
];

export type SearchResult = {
    key: string;
    ref: NodeRef;
    label: string;
    group: SearchGroup;
    /** Where it lives, top level first. */
    path: string[];
    fieldKind?: FieldKind;
};

/** A field match from the data catalog: which explore table it belongs to. */
export type FieldMatch = {
    name: string;
    label: string;
    tableName: string;
    fieldType: FieldKind;
};

/** DOM id of a result, for the search box's aria-activedescendant. */
export const searchResultId = (index: number) => `search-result-${index}`;

const groupOf = (ref: NodeRef): SearchGroup => {
    switch (ref.type) {
        case 'group':
            return 'Folders';
        case 'explore':
            return 'Explores';
        case 'field':
            return 'Fields';
        default:
            return 'Sources';
    }
};

/**
 * Matches in tree order, grouped: sources, folders, explores, then fields.
 * Fields come from the data catalog search, since field lists only load per
 * explore; each lands on the explore named after its table.
 */
export const searchProject = (
    tree: ProjectTree,
    query: string,
    fieldMatches: FieldMatch[],
    limit = 200,
): { results: SearchResult[]; total: number } => {
    const needle = query.trim().toLowerCase();
    if (!needle) return { results: [], total: 0 };
    const matches: SearchResult[] = [];
    const add = (
        ref: NodeRef,
        label: string,
        path: string[],
        fieldKind?: FieldKind,
    ) =>
        matches.push({
            key: nodeKey(ref),
            ref,
            label,
            group: groupOf(ref),
            path,
            fieldKind,
        });
    const explorePaths = new Map<string, string[]>();
    const visit = (nodes: TreeNode[]) => {
        for (const node of nodes) {
            if (node.ref.type === 'explore') {
                explorePaths.set(node.ref.exploreId, node.path);
            }
            if (
                node.label.toLowerCase().includes(needle) ||
                (node.ref.type === 'explore' &&
                    node.ref.exploreId.toLowerCase().includes(needle))
            ) {
                add(node.ref, node.label, node.path.slice(0, -1));
            }
            visit(node.children);
        }
    };
    visit(tree.nodes);
    for (const field of fieldMatches) {
        const path = explorePaths.get(field.tableName);
        if (!path) continue;
        add(
            {
                type: 'field',
                exploreId: field.tableName,
                fieldId: getItemId({
                    table: field.tableName,
                    name: field.name,
                }),
            },
            field.label,
            path,
            field.fieldType,
        );
    }
    const results = SEARCH_GROUPS.flatMap((group) =>
        matches.filter((match) => match.group === group),
    ).slice(0, limit);
    return { results, total: matches.length };
};
