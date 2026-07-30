import {
    assertUnreachable,
    getItemId,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type ItemsMap,
} from '@lightdash/common';
import { getDataAppVizFieldItems } from './getDataAppVizFieldItems';

/**
 * Which of the query's column pools a slot draws from. `series` splits or
 * colours a measure, so it draws from the dimensions. Shared with the config
 * panel: if the two disagreed, auto-binding could set a column the select
 * cannot offer.
 */
export const poolKeyForSlot = (
    field: DataAppVizField,
): 'dimension' | 'metric' => {
    switch (field.type) {
        case 'metric':
            return 'metric';
        case 'dimension':
        case 'series':
            return 'dimension';
        default:
            return assertUnreachable(
                field.type,
                `Unknown data app viz field type: ${field.type}`,
            );
    }
};

// Column ids of each type, in result order. Ids rather than items, because
// every binding is compared and stored as an id.
type Pools = Record<'dimension' | 'metric', string[]>;

const poolsFor = (itemsMap: ItemsMap): Pools => {
    const { dimensions, metrics } = getDataAppVizFieldItems(itemsMap);
    return {
        dimension: dimensions.map(getItemId),
        metric: metrics.map(getItemId),
    };
};

const poolFor = (pools: Pools, field: DataAppVizField): string[] =>
    pools[poolKeyForSlot(field)];

/**
 * Give each still-unbound slot the first column of its type that nothing else
 * has taken. Slots already in `mapping` keep what they have.
 */
const fillSlots = (
    mapping: DataAppVizFieldMapping,
    taken: Set<string>,
    pools: Pools,
    slots: DataAppVizField[],
): void => {
    for (const field of slots) {
        if (mapping[field.name]) continue;
        const next = poolFor(pools, field).find((id) => !taken.has(id));
        if (!next) continue;
        mapping[field.name] = next;
        taken.add(next);
    }
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

    fillSlots(
        mapping,
        taken,
        pools,
        fields.filter((f) => f.required),
    );
    fillSlots(
        mapping,
        taken,
        pools,
        fields.filter((f) => !f.required),
    );

    return mapping;
};

/**
 * Reconcile a saved binding against the contract and columns in force now.
 *
 * A viz is edited in place: a new build can add, remove or retype slots under
 * a uuid that never changes, and the query's columns move independently. Both
 * leave a saved `fieldMapping` describing a world that no longer exists — a
 * binding to a departed column, or to a column whose slot is now a metric.
 * Left alone those render wrong while the panel shows an empty select.
 *
 * Bindings that are still valid are kept, including two slots on one column:
 * which columns a chart uses is the user's call, and only auto-binding spreads
 * them. Required slots left unbound are filled from what remains. Optional
 * slots are *not* refilled: an unbound optional slot is indistinguishable from
 * one the user deliberately cleared, and refilling would undo the clear on
 * every render.
 *
 * Pure and derived — never written back to the saved chart, so opening a chart
 * cannot dirty it.
 */
export const reconcileDataAppVizFieldMapping = (
    fields: DataAppVizField[],
    itemsMap: ItemsMap,
    persisted: DataAppVizFieldMapping,
): DataAppVizFieldMapping => {
    const pools = poolsFor(itemsMap);
    const mapping: DataAppVizFieldMapping = {};
    const taken = new Set<string>();

    for (const field of fields) {
        const bound = persisted[field.name];
        if (!bound) continue;
        if (!poolFor(pools, field).includes(bound)) continue;
        mapping[field.name] = bound;
        taken.add(bound);
    }

    // Kept bindings are already in `mapping`, so this only reaches slots the
    // contract requires and nothing valid claimed.
    fillSlots(
        mapping,
        taken,
        pools,
        fields.filter((f) => f.required),
    );

    return mapping;
};
