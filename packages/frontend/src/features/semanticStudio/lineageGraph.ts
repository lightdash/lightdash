/** The dbt models behind an explore's tables, and the models built from them, as one graph. */
import { type Explore, type LineageGraph } from '@lightdash/common';
import { type JoinLink } from './joinGraph';

/** Where a model sits relative to the explore. */
export type LineageRole =
    | 'base'
    | 'joined'
    | 'upstream'
    | 'downstream'
    | 'other';

export type LineageModelNode = {
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
export const relatedModels = (
    links: readonly JoinLink[],
    id: string,
): Set<string> =>
    new Set([
        id,
        ...reachable([id], adjacency(links, 'target')),
        ...reachable([id], adjacency(links, 'source')),
    ]);

/** Edges run from a model to the models built from it, so sources sit on the left. */
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
    const downstream = reachable(exploreModels, adjacency(linkList, 'source'));
    const roleOf = (id: string): LineageRole => {
        if (id === baseModel) return 'base';
        if (labelByModel.has(id)) return 'joined';
        if (upstream.has(id)) return 'upstream';
        if (downstream.has(id)) return 'downstream';
        return 'other';
    };

    const ids = new Set([
        ...exploreModels,
        ...Object.keys(merged),
        ...linkList.flatMap(({ source, target }) => [source, target]),
    ]);
    const models = [...ids].map<LineageModelNode>((id) => ({
        id,
        label: labelByModel.get(id) ?? null,
        role: roleOf(id),
    }));
    return { models, links: linkList };
};
