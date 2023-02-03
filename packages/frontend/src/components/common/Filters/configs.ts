import {
    assertUnreachable,
    ConditionalRule,
    DimensionType,
    Field,
    FilterableField,
    FilterableItem,
    FilterOperator,
    FilterType,
    formatBoolean,
    formatDate,
    formatTimestamp,
    getFilterTypeFromItem,
    getItemId,
    isDashboardFilterRule,
    isDimension,
    isField,
    isFilterableItem,
    isFilterRule,
    isMomentInput,
    TableCalculation,
} from '@lightdash/common';
import isEmpty from 'lodash-es/isEmpty';
import uniq from 'lodash-es/uniq';
import BooleanFilterInputs from './FilterInputs/BooleanFilterInputs';
import DateFilterInputs from './FilterInputs/DateFilterInputs';
import DefaultFilterInputs, {
    FilterInputsProps,
} from './FilterInputs/DefaultFilterInputs';

export const filterOperatorLabel: Record<FilterOperator, string> = {
    [FilterOperator.NULL]: 'is null',
    [FilterOperator.NOT_NULL]: 'is not null',
    [FilterOperator.EQUALS]: 'is equal to',
    [FilterOperator.NOT_EQUALS]: 'is not equal to',
    [FilterOperator.STARTS_WITH]: 'starts with',
    [FilterOperator.NOT_INCLUDE]: 'does not include',
    [FilterOperator.INCLUDE]: 'includes',
    [FilterOperator.LESS_THAN]: 'is less than',
    [FilterOperator.LESS_THAN_OR_EQUAL]: 'is less than or equal',
    [FilterOperator.GREATER_THAN]: 'is greater than',
    [FilterOperator.GREATER_THAN_OR_EQUAL]: 'is greater than or equal',
    [FilterOperator.IN_THE_PAST]: 'in the last',
    [FilterOperator.IN_THE_NEXT]: 'in the next',
    [FilterOperator.IN_THE_CURRENT]: 'in the current',
    [FilterOperator.IN_BETWEEN]: 'is between',
};

const getFilterOptions = <T extends FilterOperator>(
    operators: Array<T>,
): Array<{ value: T; label: string }> =>
    operators.map((operator) => ({
        value: operator,
        label: filterOperatorLabel[operator],
    }));

const timeFilterOptions: Array<{
    value: FilterOperator;
    label: string;
}> = [
    ...getFilterOptions([
        FilterOperator.NULL,
        FilterOperator.NOT_NULL,
        FilterOperator.EQUALS,
        FilterOperator.NOT_EQUALS,
        FilterOperator.IN_THE_PAST,
        FilterOperator.IN_THE_NEXT,
        FilterOperator.IN_THE_CURRENT,
    ]),
    { value: FilterOperator.LESS_THAN, label: 'is before' },
    { value: FilterOperator.LESS_THAN_OR_EQUAL, label: 'is on or before' },
    { value: FilterOperator.GREATER_THAN, label: 'is after' },
    { value: FilterOperator.GREATER_THAN_OR_EQUAL, label: 'is on or after' },
    { value: FilterOperator.IN_BETWEEN, label: 'is between' },
];

type FilterInputPropType = <T extends ConditionalRule>(
    props: React.PropsWithChildren<FilterInputsProps<T>>,
) => JSX.Element;

export const FilterTypeConfig: Record<
    FilterType,
    {
        operatorOptions: Array<{ value: FilterOperator; label: string }>;
        inputs: FilterInputPropType;
    }
> = {
    [FilterType.STRING]: {
        operatorOptions: getFilterOptions([
            FilterOperator.NULL,
            FilterOperator.NOT_NULL,
            FilterOperator.EQUALS,
            FilterOperator.NOT_EQUALS,
            FilterOperator.STARTS_WITH,
            FilterOperator.INCLUDE,
            FilterOperator.NOT_INCLUDE,
        ]),
        inputs: DefaultFilterInputs,
    },
    [FilterType.NUMBER]: {
        operatorOptions: getFilterOptions([
            FilterOperator.NULL,
            FilterOperator.NOT_NULL,
            FilterOperator.EQUALS,
            FilterOperator.NOT_EQUALS,
            FilterOperator.LESS_THAN,
            FilterOperator.GREATER_THAN,
        ]),
        inputs: DefaultFilterInputs,
    },
    [FilterType.DATE]: {
        operatorOptions: timeFilterOptions,
        inputs: DateFilterInputs,
    },
    [FilterType.BOOLEAN]: {
        operatorOptions: getFilterOptions([
            FilterOperator.NULL,
            FilterOperator.NOT_NULL,
            FilterOperator.EQUALS,
        ]),
        inputs: BooleanFilterInputs,
    },
};

type FilterRuleLabels = {
    field: string;
    operator: string;
    value?: string;
};

export const getValueAsString = (
    filterType: FilterType,
    rule: ConditionalRule,
    field: Field | TableCalculation,
) => {
    const { operator, values } = rule;
    const firstValue = values?.[0];
    const secondValue = values?.[1];

    switch (filterType) {
        case FilterType.STRING:
        case FilterType.NUMBER:
            return values?.join(', ');
        case FilterType.BOOLEAN:
            return values?.map(formatBoolean).join(', ');
        case FilterType.DATE:
            switch (operator) {
                case FilterOperator.IN_THE_PAST:
                case FilterOperator.IN_THE_NEXT:
                    if (!isFilterRule(rule)) throw new Error('Invalid rule');

                    return `${firstValue} ${
                        rule.settings.completed ? 'completed ' : ''
                    }${rule.settings.unitOfTime}`;
                case FilterOperator.IN_BETWEEN:
                    return `${firstValue} and ${secondValue}`;
                case FilterOperator.IN_THE_CURRENT:
                    if (!isFilterRule(rule)) throw new Error('Invalid rule');

                    return rule.settings.unitOfTime.slice(0, -1);
                case FilterOperator.NULL:
                case FilterOperator.NOT_NULL:
                case FilterOperator.EQUALS:
                case FilterOperator.NOT_EQUALS:
                case FilterOperator.STARTS_WITH:
                case FilterOperator.INCLUDE:
                case FilterOperator.NOT_INCLUDE:
                case FilterOperator.LESS_THAN:
                case FilterOperator.LESS_THAN_OR_EQUAL:
                case FilterOperator.GREATER_THAN:
                case FilterOperator.GREATER_THAN_OR_EQUAL:
                    return values
                        ?.map((value) => {
                            if (
                                isDimension(field) &&
                                isMomentInput(value) &&
                                field.type === DimensionType.TIMESTAMP
                            ) {
                                return formatTimestamp(
                                    value,
                                    field.timeInterval,
                                );
                            } else if (
                                isDimension(field) &&
                                isMomentInput(value) &&
                                field.type === DimensionType.DATE
                            ) {
                                return formatDate(value, field.timeInterval);
                            } else {
                                return value;
                            }
                        })
                        .join(', ');
                default:
                    return assertUnreachable(
                        operator,
                        `Unexpected operator: ${operator}`,
                    );
            }
        default:
            return assertUnreachable(
                filterType,
                `Unexpected filter type: ${filterType}`,
            );
    }
};

export const getConditionalRuleLabel = (
    rule: ConditionalRule,
    item: FilterableItem,
): FilterRuleLabels => {
    const filterType = isFilterableItem(item)
        ? getFilterTypeFromItem(item)
        : FilterType.STRING;
    const filterConfig = FilterTypeConfig[filterType];
    const operationLabel =
        filterConfig.operatorOptions.find((o) => o.value === rule.operator)
            ?.label || filterOperatorLabel[rule.operator];

    return {
        field: isField(item) ? item.label : item.name,
        operator: operationLabel,
        value: getValueAsString(filterType, rule, item),
    };
};

export const getFilterRuleTables = (
    filterRule: ConditionalRule,
    field: FilterableField,
    filterableFields: FilterableField[],
): string[] => {
    if (
        isDashboardFilterRule(filterRule) &&
        filterRule.tileTargets &&
        !isEmpty(filterRule.tileTargets)
    ) {
        return Object.values(filterRule.tileTargets).reduce<string[]>(
            (tables, tileTarget) => {
                const targetField = filterableFields.find(
                    (f) =>
                        f.table === tileTarget.tableName &&
                        getItemId(f) === tileTarget.fieldId,
                );
                return targetField
                    ? uniq([...tables, targetField.tableLabel])
                    : tables;
            },
            [],
        );
    } else {
        return [field.tableLabel];
    }
};
