/** An explore's joins as a graph: its base table, the tables joined to it and how. */
import Dagre from '@dagrejs/dagre';
import {
    JoinRelationship,
    type CompiledExploreJoin,
    type Explore,
} from '@lightdash/common';

export type JoinTableNode = {
    /** The table's name in the explore: its alias when joined under one. */
    id: string;
    label: string;
    description: string | null;
    /** The model it reads, when joined under an alias. */
    modelName: string | null;
    isBase: boolean;
    isHidden: boolean;
    /** The table the condition joins it to; null for the base table. */
    parent: string | null;
    relationship: JoinRelationship | null;
    /** The join condition, `${a.x} = ${b.y}` shown as `a.x = b.y`. */
    keys: string | null;
    /** The joined table's own columns in the condition, for a short label. */
    keyColumns: string[];
    joinType: string | null;
};

export type JoinLink = { id: string; source: string; target: string };

export type JoinGraph = { tables: JoinTableNode[]; links: JoinLink[] };

const REFERENCE = /\$\{\s*([^.}\s]+)\.([^}\s]+)\s*\}/g;

/** `${orders.customer_id} = ${customers.customer_id}` -> `orders.customer_id = customers.customer_id`. */
export const formatJoinKeys = (sqlOn: string): string =>
    sqlOn.replace(REFERENCE, '$1.$2').replace(/\s+/g, ' ').trim();

const ownColumns = (join: CompiledExploreJoin): string[] => [
    ...new Set(
        [...join.sqlOn.matchAll(REFERENCE)]
            .filter(([, table]) => table === join.table)
            .map(([, , column]) => column),
    ),
];

const referencedTables = (join: CompiledExploreJoin): string[] =>
    join.tablesReferences ??
    [...join.sqlOn.matchAll(REFERENCE)].map(([, table]) => table);

/** The first table the condition names that is already in the graph; the base table otherwise. */
const parentOf = (
    join: CompiledExploreJoin,
    known: ReadonlySet<string>,
    baseTable: string,
): string =>
    referencedTables(join).find(
        (table) => table !== join.table && known.has(table),
    ) ?? baseTable;

export const toJoinGraph = (
    explore: Pick<Explore, 'baseTable' | 'joinedTables' | 'tables'>,
): JoinGraph => {
    const { baseTable, joinedTables, tables } = explore;
    const labelOf = (name: string) => tables[name]?.label ?? name;
    // A description that only names the table (`orders table`) says nothing new.
    const descriptionOf = (name: string) => {
        const description = tables[name]?.description?.trim();
        if (!description) return null;
        const names = [name, tables[name]?.originalName].filter(Boolean);
        return names.some(
            (n) => description.toLowerCase() === `${n} table`.toLowerCase(),
        )
            ? null
            : description;
    };
    const modelOf = (name: string) => {
        const original = tables[name]?.originalName;
        return original && original !== name ? original : null;
    };
    const base: JoinTableNode = {
        id: baseTable,
        label: labelOf(baseTable),
        description: descriptionOf(baseTable),
        modelName: modelOf(baseTable),
        isBase: true,
        isHidden: false,
        parent: null,
        relationship: null,
        keys: null,
        keyColumns: [],
        joinType: null,
    };
    const known = new Set([baseTable, ...joinedTables.map((j) => j.table)]);
    const joined = joinedTables.map<JoinTableNode>((join) => ({
        id: join.table,
        label: labelOf(join.table),
        description: descriptionOf(join.table),
        modelName: modelOf(join.table),
        isBase: false,
        isHidden: join.hidden ?? false,
        parent: parentOf(join, known, baseTable),
        relationship: join.relationship ?? null,
        keys: formatJoinKeys(join.sqlOn),
        keyColumns: ownColumns(join),
        joinType: join.type ?? null,
    }));
    const links = joined.map<JoinLink>(({ id, parent }) => ({
        id: `${parent}->${id}`,
        source: parent ?? baseTable,
        target: id,
    }));
    return { tables: [base, ...joined], links };
};

/** The table and every table between it and the base table. */
export const pathToBase = (
    tables: readonly JoinTableNode[],
    id: string,
): Set<string> => {
    const parentById = new Map(tables.map((table) => [table.id, table.parent]));
    const path = new Set<string>();
    let current: string | null | undefined = id;
    while (current && !path.has(current)) {
        path.add(current);
        current = parentById.get(current);
    }
    return path;
};

/** Joining many rows per row of the table it joins to repeats that table's rows. */
export const isFanOut = (relationship: JoinRelationship | null): boolean =>
    relationship === JoinRelationship.ONE_TO_MANY ||
    relationship === JoinRelationship.MANY_TO_MANY;

export const JOIN_NODE_WIDTH = 232;
export const JOIN_NODE_HEIGHT = 82;

/** Left-to-right positions, top-left corners, base table first. */
export const layoutJoinGraph = ({
    tables,
    links,
}: JoinGraph): Map<string, { x: number; y: number }> => {
    const graph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: 'LR', ranksep: 56, nodesep: 16 });
    tables.forEach((table) =>
        graph.setNode(table.id, {
            width: JOIN_NODE_WIDTH,
            height: JOIN_NODE_HEIGHT,
        }),
    );
    links.forEach((link) => graph.setEdge(link.source, link.target));
    Dagre.layout(graph);
    return new Map(
        tables.map((table) => {
            const { x, y } = graph.node(table.id);
            return [
                table.id,
                { x: x - JOIN_NODE_WIDTH / 2, y: y - JOIN_NODE_HEIGHT / 2 },
            ];
        }),
    );
};
