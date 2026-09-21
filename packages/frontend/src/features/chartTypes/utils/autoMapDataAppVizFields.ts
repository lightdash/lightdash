import {
    assertUnreachable,
    getDataAppVizFieldIds,
    getItemId,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import { bindableTableCalculations } from './chartTypePreviewTableCalcs';
import { getDataAppVizFieldItems } from './getDataAppVizFieldItems';

/**
 * Which of the query's column pools a slot draws from. `series` splits or
 * colours a measure, so it draws from the dimensions; `column` accepts any
 * result column, metrics first so auto-binding favours measures. Shared with
 * the config panel: if the two disagreed, auto-binding could set a column the
 * select cannot offer.
 */
export const poolKeyForSlot = (
    field: DataAppVizField,
): 'dimension' | 'metric' | 'column' => {
    switch (field.type) {
        case 'metric':
            return 'metric';
        case 'dimension':
        case 'series':
            return 'dimension';
        case 'column':
            return 'column';
        default:
            return assertUnreachable(
                field.type,
                `Unknown data app viz field type: ${field.type}`,
            );
    }
};

/** Column ids of each type, in result order. Ids rather than items, because
 *  every binding is compared and stored as an id. */
export type DataAppVizFieldPools = Record<
    'dimension' | 'metric' | 'column',
    string[]
>;

export const dataAppVizFieldPools = (
    itemsMap: ItemsMap,
): DataAppVizFieldPools => {
    const { dimensions, metrics } = getDataAppVizFieldItems(itemsMap);
    return {
        dimension: dimensions.map(getItemId),
        metric: metrics.map(getItemId),
        column: [...metrics, ...dimensions].map(getItemId),
    };
};

/** The same pools read straight off a query, for the times a chart's columns
 *  are known but its explore has not been fetched. Only table calculations
 *  the preview could keep valid are offered. */
export const dataAppVizFieldPoolsFromMetricQuery = (
    metricQuery: MetricQuery,
): DataAppVizFieldPools => {
    const metric = [
        ...metricQuery.metrics,
        ...bindableTableCalculations(metricQuery).map(getItemId),
    ];
    return {
        dimension: metricQuery.dimensions,
        metric,
        column: [...metric, ...metricQuery.dimensions],
    };
};

const poolFor = (
    pools: DataAppVizFieldPools,
    field: DataAppVizField,
): string[] => pools[poolKeyForSlot(field)];

const setBinding = (
    mapping: DataAppVizFieldMapping,
    field: DataAppVizField,
    ids: string[],
): void => {
    if (field.multiple) {
        mapping[field.name] = ids;
    } else if (ids[0]) {
        mapping[field.name] = ids[0];
    }
};

/**
 * Give each still-unbound slot the first column of its type that nothing else
 * has taken. Slots already in `mapping` keep what they have.
 */
const fillSlots = (
    mapping: DataAppVizFieldMapping,
    taken: Set<string>,
    pools: DataAppVizFieldPools,
    slots: DataAppVizField[],
): void => {
    for (const field of slots) {
        if (mapping[field.name] !== undefined) continue;
        const next = poolFor(pools, field).find((id) => !taken.has(id));
        if (!next) continue;
        setBinding(mapping, field, [next]);
        taken.add(next);
    }
};

const fillMultipleSlots = (
    mapping: DataAppVizFieldMapping,
    taken: Set<string>,
    pools: DataAppVizFieldPools,
    slots: DataAppVizField[],
): void => {
    for (const field of slots) {
        if (!field.multiple || mapping[field.name] === undefined) continue;
        const extras = poolFor(pools, field).filter((id) => !taken.has(id));
        if (extras.length === 0) continue;
        mapping[field.name] = [
            ...getDataAppVizFieldIds(mapping[field.name]),
            ...extras,
        ];
        extras.forEach((id) => taken.add(id));
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
export const autoMapDataAppVizFieldsFromPools = (
    fields: DataAppVizField[],
    pools: DataAppVizFieldPools,
): DataAppVizFieldMapping => {
    const mapping: DataAppVizFieldMapping = {};
    const taken = new Set<string>();

    fillSlots(
        mapping,
        taken,
        pools,
        fields.filter((f) => f.required),
    );
    // Required slots each get one column before a multiple slot consumes the
    // remaining compatible columns. This keeps a sparse query renderable.
    fillMultipleSlots(
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
    fillMultipleSlots(
        mapping,
        taken,
        pools,
        fields.filter((f) => !f.required),
    );

    return mapping;
};

export const autoMapDataAppVizFields = (
    fields: DataAppVizField[],
    itemsMap: ItemsMap,
): DataAppVizFieldMapping =>
    autoMapDataAppVizFieldsFromPools(fields, dataAppVizFieldPools(itemsMap));

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
const reconcileFromPools = (
    fields: DataAppVizField[],
    pools: DataAppVizFieldPools,
    persisted: DataAppVizFieldMapping,
): DataAppVizFieldMapping => {
    const mapping: DataAppVizFieldMapping = {};
    const taken = new Set<string>();

    for (const field of fields) {
        const persistedValue = persisted[field.name];
        if (persistedValue === undefined) continue;
        const valid = getDataAppVizFieldIds(persistedValue).filter(
            (id, index, ids) =>
                poolFor(pools, field).includes(id) && ids.indexOf(id) === index,
        );
        // An explicit empty array is a user clear, including for required
        // slots. Validation reports the missing requirement rather than silently
        // undoing the clear.
        if (field.multiple) {
            if (
                valid.length > 0 ||
                (Array.isArray(persistedValue) && persistedValue.length === 0)
            ) {
                mapping[field.name] = valid;
                valid.forEach((id) => taken.add(id));
            }
        } else if (valid[0]) {
            mapping[field.name] = valid[0];
            taken.add(valid[0]);
        }
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

export const reconcileDataAppVizFieldMapping = (
    fields: DataAppVizField[],
    itemsMap: ItemsMap,
    persisted: DataAppVizFieldMapping,
): DataAppVizFieldMapping =>
    reconcileFromPools(fields, dataAppVizFieldPools(itemsMap), persisted);

/**
 * Fill the required slots a binding leaves empty, and leave every other
 * binding exactly as the author left it — including one that no longer fits,
 * which the preview reports rather than silently corrects.
 */
export const fillUnboundDataAppVizFields = (
    fields: DataAppVizField[],
    pools: DataAppVizFieldPools,
    persisted: DataAppVizFieldMapping,
): DataAppVizFieldMapping => {
    const mapping: DataAppVizFieldMapping = { ...persisted };
    const taken = new Set(
        Object.values(persisted).flatMap(getDataAppVizFieldIds),
    );
    fillSlots(
        mapping,
        taken,
        pools,
        fields.filter((f) => f.required),
    );
    return mapping;
};

/** Required slots the mapping leaves empty, in declared order. */
export const getUnboundRequiredDataAppVizFields = (
    fields: DataAppVizField[],
    mapping: DataAppVizFieldMapping,
): DataAppVizField[] =>
    fields.filter(
        (field) =>
            field.required &&
            getDataAppVizFieldIds(mapping[field.name]).length === 0,
    );
