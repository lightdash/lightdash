import type { Explore } from '../../types/explore';
import { convertFieldRefToFieldId } from '../../types/field';
import {
    FilterOperator,
    type FilterGroup,
    type FilterGroupItem,
    type FilterRule,
} from '../../types/filter';
import type { PreAggregateDef } from '../../types/preAggregate';
import { resolveRequiredFilterDeferrals } from './resolvePreAggregateDef';

type PreAggregateFilterRule = FilterRule<
    FilterOperator,
    { fieldRef: string },
    unknown,
    unknown
>;

/**
 * Single conversion shared by the materialization payload builder and the
 * matcher: turns a definition's explicit filters into a dimension filter group
 * and emits one enabled same-target tautology per deferred required filter.
 * The tautology suppresses the model fallback through the documented
 * required-filter presence semantics, so any MetricQueryBuilder version that
 * replays the persisted payload materializes without the baked filter — while
 * the rollup read path still re-applies it from the explore's requiredFilters —
 * and the matcher's fallback reduction drops the deferred rule the same way.
 */
export const getPreAggregateDimensionFilters = ({
    sourceExplore,
    preAggregateDef,
}: {
    sourceExplore: Explore;
    preAggregateDef: PreAggregateDef;
}): FilterGroup | undefined => {
    const { baseTable } = sourceExplore;
    const filterRules = (preAggregateDef.filters ?? []).map<FilterRule>(
        (filter: PreAggregateFilterRule) => ({
            id: filter.id,
            target: {
                fieldId: convertFieldRefToFieldId(
                    filter.target.fieldRef,
                    baseTable,
                ),
            },
            operator: filter.operator,
            values: filter.values,
            ...(filter.settings ? { settings: filter.settings } : {}),
            ...(filter.required !== undefined
                ? { required: filter.required }
                : {}),
            ...(filter.disabled !== undefined
                ? { disabled: filter.disabled }
                : {}),
        }),
    );

    const deferredTargetFieldIds = Array.from(
        new Set(
            resolveRequiredFilterDeferrals({
                sourceExplore,
                preAggregateDef,
            }).map(({ targetFieldId }) => targetFieldId),
        ),
    );
    const deferralTautologies = deferredTargetFieldIds.map<FilterGroup>(
        (fieldId) => ({
            id: `deferred-required-filter:${fieldId}`,
            or: [
                {
                    id: `deferred-required-filter:${fieldId}:null`,
                    target: { fieldId },
                    operator: FilterOperator.NULL,
                    values: [],
                },
                {
                    id: `deferred-required-filter:${fieldId}:not-null`,
                    target: { fieldId },
                    operator: FilterOperator.NOT_NULL,
                    values: [],
                },
            ],
        }),
    );

    const items: FilterGroupItem[] = [...filterRules, ...deferralTautologies];
    if (items.length === 0) {
        return undefined;
    }

    return {
        id: 'pre-aggregate-filters',
        and: items,
    };
};
