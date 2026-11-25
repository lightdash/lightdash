/** The dbt models behind an explore's tables, as one graph. */
import { type Explore, type LineageGraph } from '@lightdash/common';
import { type JoinGraph, type JoinLink } from './joinGraph';

/** Where a model sits relative to the explore. */
type LineageRole = 'base' | 'joined' | 'upstream';

type LineageModelNode = {
    /** The dbt model name. */
    id: string;
    /** The explore table's label, for models the explore reads. */
    label: string | null;
    role: LineageRole;
};

type ModelLineage = { models: LineageModelNode[]; links: JoinLink[] };

/** Every model reachable from `start` by following `next`. */
const reachable = (
    start: readonly string[],
    next: ReadonlyMap<string, readonly string[]>,
): Set<string> => {
    const seen = new Set<string>();
    const queue = [...start];
    // The loop also visits what it appends.
    for (const id of queue) {
        (next.get(id) ?? []).forEach((neighbour) => {
            if (seen.has(neighbour)) return;
            seen.add(neighbour);
            queue.push(neighbour);
        });
    }
    return seen;
};

const adjacency = (links: readonly JoinLink[], from: 'source' | 'target') => {
    const to = from === 'source' ? 'target' : 'source';
    return links.reduce((map, link) => {
        map.set(link[from], [...(map.get(link[from]) ?? []), link[to]]);
        return map;
    }, new Map<string, string[]>());
};

/** The models upstream and downstream of `id`, and `id` itself. */
const relatedModels = (links: readonly JoinLink[], id: string): Set<string> =>
    new Set([
        id,
        ...reachable([id], adjacency(links, 'target')),
        ...reachable([id], adjacency(links, 'source')),
    ]);

/** The explore's models and those upstream of them; edges run from a model to the models built from it, so sources sit on the left. */
export const toModelLineage = (
    explore: Pick<Explore, 'baseTable' | 'joinedTables' | 'tables'>,
): ModelLineage => {
    const { baseTable, joinedTables, tables } = explore;
    const modelOf = (name: string) => tables[name]?.originalName ?? name;
    const exploreTables = [baseTable, ...joinedTables.map((j) => j.table)];
    const merged: LineageGraph = Object.assign(
        {},
        ...exploreTables.map((name) => tables[name]?.lineageGraph ?? {}),
    );

    const links = new Map<string, JoinLink>();
    Object.entries(merged).forEach(([model, dependencies]) =>
        dependencies.forEach(({ name }) => {
            const id = `${name}->${model}`;
            links.set(id, { id, source: name, target: model });
        }),
    );
    const linkList = [...links.values()];

    const labelByModel = new Map<string, string>();
    exploreTables.forEach((name) => {
        if (!labelByModel.has(modelOf(name))) {
            labelByModel.set(modelOf(name), tables[name]?.label ?? name);
        }
    });
    const baseModel = modelOf(baseTable);
    const exploreModels = [...labelByModel.keys()];
    const upstream = reachable(exploreModels, adjacency(linkList, 'target'));
    const roleOf = (id: string): LineageRole => {
        if (id === baseModel) return 'base';
        if (labelByModel.has(id)) return 'joined';
        return 'upstream';
    };

    // From the sources up to the explore: nothing built from its tables.
    const ids = new Set([...exploreModels, ...upstream]);
    const models = [...ids].map<LineageModelNode>((id) => ({
        id,
        label: labelByModel.get(id) ?? null,
        role: roleOf(id),
    }));
    return {
        models,
        links: linkList.filter(
            ({ source, target }) => ids.has(source) && ids.has(target),
        ),
    };
};

/** A dbt model upstream of the explore, drawn to the left of its tables. */
export type LineageCard = LineageModelNode & { nodeId: string };

type JoinsWithLineage = {
    /** Upstream models the explore does not read; the ones it reads are its tables. */
    cards: LineageCard[];
    /** "Built from" edges, between table and model node ids. */
    links: JoinLink[];
    /** For a node id, every node upstream or downstream of it in dbt. */
    relatedTo: (nodeId: string) => Set<string>;
};

const cardId = (model: string) => `dbt:${model}`;

/** Lays the dbt models upstream of the explore over its join graph; a model the explore reads is its table's node. */
export const withLineage = (
    graph: JoinGraph,
    lineage: ModelLineage,
): JoinsWithLineage => {
    const tablesByModel = graph.tables.reduce((map, table) => {
        const model = table.modelName ?? table.id;
        map.set(model, [...(map.get(model) ?? []), table.id]);
        return map;
    }, new Map<string, string[]>());
    const nodeIdsOf = (model: string) =>
        tablesByModel.get(model) ?? [cardId(model)];
    const modelByNodeId = new Map(
        lineage.models.flatMap(({ id }) =>
            nodeIdsOf(id).map((nodeId) => [nodeId, id] as const),
        ),
    );
    const cards = lineage.models
        .filter(({ id }) => !tablesByModel.has(id))
        .map<LineageCard>((model) => ({ ...model, nodeId: cardId(model.id) }));
    const links = lineage.links.flatMap(({ source, target }) =>
        nodeIdsOf(source).flatMap((from) =>
            nodeIdsOf(target).map<JoinLink>((to) => ({
                id: `lineage:${from}->${to}`,
                source: from,
                target: to,
            })),
        ),
    );
    const relatedTo = (nodeId: string) => {
        const model = modelByNodeId.get(nodeId);
        if (!model) return new Set([nodeId]);
        return new Set(
            [...relatedModels(lineage.links, model)].flatMap(nodeIdsOf),
        );
    };
    return { cards, links, relatedTo };
};
