import { convertFieldRefToFieldId } from '../../types/field';
import type {
    FilterGroup,
    FilterOperator,
    FilterRule,
} from '../../types/filter';

type PreAggregateFilterRule = FilterRule<
    FilterOperator,
    { fieldRef: string },
    unknown,
    unknown
>;

export const getPreAggregateDimensionFilters = ({
    filters,
    baseTable,
}: {
    filters: PreAggregateFilterRule[] | undefined;
    baseTable: string;
}): FilterGroup | undefined => {
    if (!filters || filters.length === 0) {
        return undefined;
    }

    return {
        id: 'pre-aggregate-filters',
        and: filters.map<FilterRule>((filter) => ({
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
        })),
    };
};
