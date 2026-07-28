import {
    getItemId,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type Item,
    type ItemsMap,
} from '@lightdash/common';
import { getDataAppVizFieldItems } from './getDataAppVizFieldItems';

/**
 * Bind a viz contract's declared slots to the query's result columns.
 *
 * Slots take columns from the pool matching their type — `metric` slots from
 * the metrics (table calculations included), `dimension` and `series` slots
 * from the dimensions. Each column is used at most once, so a two-dimension
 * contract never binds the same column twice.
 *
 * Required slots are filled before optional ones so a scarce column lands
 * where it is needed rather than in whichever slot happens to be declared
 * first. Within each pass, declared order wins.
 *
 * Returns only the slots it could fill; callers treat a missing entry as
 * unbound.
 */
export const autoMapDataAppVizFields = (
    fields: DataAppVizField[],
    itemsMap: ItemsMap,
): DataAppVizFieldMapping => {
    const { dimensions, metrics } = getDataAppVizFieldItems(itemsMap);

    // `series` splits/colours a measure, so it binds to a dimension — matching
    // how every other consumer buckets the three declared types.
    const pools: Record<'metric' | 'dimension', Item[]> = {
        metric: [...metrics],
        dimension: [...dimensions],
    };

    const mapping: DataAppVizFieldMapping = {};
    const take = (field: DataAppVizField) => {
        const pool = field.type === 'metric' ? pools.metric : pools.dimension;
        const next = pool.shift();
        if (next) mapping[field.name] = getItemId(next);
    };

    fields.filter((f) => f.required).forEach(take);
    fields.filter((f) => !f.required).forEach(take);

    return mapping;
};
