import {
    getItemId,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type Item,
    type ItemsMap,
} from '@lightdash/common';
import { getDataAppVizFieldItems } from './getDataAppVizFieldItems';

// `series` splits/colours a measure, so it binds to a dimension — matching how
// every other consumer buckets the three declared types.
const isMetricSlot = (field: DataAppVizField) => field.type === 'metric';

type Pools = { metric: Item[]; dimension: Item[] };

const poolsFor = (itemsMap: ItemsMap): Pools => {
    const { dimensions, metrics } = getDataAppVizFieldItems(itemsMap);
    return { metric: metrics, dimension: dimensions };
};

const poolFor = (pools: Pools, field: DataAppVizField): Item[] =>
    isMetricSlot(field) ? pools.metric : pools.dimension;

/** Bind `field` to the first column of its type that nothing else has taken. */
const fill = (
    mapping: DataAppVizFieldMapping,
    taken: Set<string>,
    pools: Pools,
    field: DataAppVizField,
): void => {
    if (mapping[field.name]) return;
    const next = poolFor(pools, field).find((i) => !taken.has(getItemId(i)));
    if (!next) return;
    mapping[field.name] = getItemId(next);
    taken.add(getItemId(next));
};

/**
 * Bind a viz contract's declared slots to the query's result columns.
 *
 * Each column is used at most once, so a two-dimension contract never binds
 * the same column twice. Required slots are filled before optional ones so a
 * scarce column lands where it is needed rather than in whichever slot happens
 * to be declared first. Within each pass, declared order wins.
 *
 * Returns only the slots it could fill; callers treat a missing entry as
 * unbound.
 */
export const autoMapDataAppVizFields = (
    fields: DataAppVizField[],
    itemsMap: ItemsMap,
): DataAppVizFieldMapping => {
    const pools = poolsFor(itemsMap);
    const mapping: DataAppVizFieldMapping = {};
    const taken = new Set<string>();

    fields
        .filter((f) => f.required)
        .forEach((f) => fill(mapping, taken, pools, f));
    fields
        .filter((f) => !f.required)
        .forEach((f) => fill(mapping, taken, pools, f));

    return mapping;
};
