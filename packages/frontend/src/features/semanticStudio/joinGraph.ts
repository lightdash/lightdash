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
    /** The model it reads, when joined under an alias. */
    modelName: string | null;
    isBase: boolean;
    isHidden: boolean;
    /** The join condition, `${a.x} = ${b.y}` shown as `a.x = b.y`. */
    keys: string | null;
    joinType: string | null;
};

export type JoinLink = {
    id: string;
    /** The table the condition joins it to: the base table, or an earlier join. */
    source: string;
    target: string;
    relationship: JoinRelationship | null;
};

export type JoinGraph = { tables: JoinTableNode[]; links: JoinLink[] };

const REFERENCE = /\$\{\s*([^.}\s]+)\.([^}\s]+)\s*\}/g;

/** `${orders.customer_id} = ${customers.customer_id}` -> `orders.customer_id = customers.customer_id`. */
export const formatJoinKeys = (sqlOn: string): string =>
    sqlOn.replace(REFERENCE, '$1.$2').replace(/\s+/g, ' ').trim();

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
    const modelOf = (name: string) => {
        const original = tables[name]?.originalName;
        return original && original !== name ? original : null;
    };
    const base: JoinTableNode = {
        id: baseTable,
        label: labelOf(baseTable),
        modelName: modelOf(baseTable),
        isBase: true,
        isHidden: false,
        keys: null,
        joinType: null,
    };
    const known = new Set([baseTable, ...joinedTables.map((j) => j.table)]);
    const joined = joinedTables.map<JoinTableNode>((join) => ({
        id: join.table,
        label: labelOf(join.table),
        modelName: modelOf(join.table),
        isBase: false,
        isHidden: join.hidden ?? false,
        keys: formatJoinKeys(join.sqlOn),
        joinType: join.type ?? null,
    }));
    const links = joinedTables.map<JoinLink>((join) => {
        const source = parentOf(join, known, baseTable);
        return {
            id: `${source}->${join.table}`,
            source,
            target: join.table,
            relationship: join.relationship ?? null,
        };
    });
    return { tables: [base, ...joined], links };
};

/** Joining many rows per row of the table it joins to repeats that table's rows. */
export const isFanOut = (relationship: JoinRelationship | null): boolean =>
    relationship === JoinRelationship.ONE_TO_MANY ||
    relationship === JoinRelationship.MANY_TO_MANY;

/** Each side's cardinality, `[source, target]`. */
export const cardinalityOf = (
    relationship: JoinRelationship | null,
): [string, string] | null => {
    switch (relationship) {
        case JoinRelationship.ONE_TO_ONE:
            return ['1', '1'];
        case JoinRelationship.ONE_TO_MANY:
            return ['1', 'N'];
        case JoinRelationship.MANY_TO_ONE:
            return ['N', '1'];
        case JoinRelationship.MANY_TO_MANY:
            return ['N', 'N'];
        default:
            return null;
    }
};

const JOIN_NODE_WIDTH = 240;
const JOIN_NODE_HEIGHT = 76;

/** Left-to-right positions, top-left corners, base table first. */
export const layoutJoinGraph = ({
    tables,
    links,
}: JoinGraph): Map<string, { x: number; y: number }> => {
    const graph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 20 });
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
