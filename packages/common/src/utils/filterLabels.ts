import { type MomentInput } from 'moment';
import { type ConditionalRuleLabel } from '../types/conditionalFormatting';
import {
    DimensionType,
    isCustomSqlDimension,
    isDimension,
    isField,
    type CustomSqlDimension,
    type Field,
    type FilterableField,
    type FilterableItem,
    type TableCalculation,
} from '../types/field';
import {
    FilterOperator,
    FilterType,
    isFilterRule,
    type BaseFilterRule,
    type DateFilterSettings,
} from '../types/filter';
import { TimeFrames } from '../types/timeFrames';
import assertUnreachable from './assertUnreachable';
import { getFilterTypeFromItem } from './filters';
import {
    formatBoolean,
    formatDate,
    getLocalTimeDisplay,
    isMomentInput,
} from './formatting';

const NULL_VALUE_LABEL = '(null)';

export const filterOperatorLabel: Record<FilterOperator, string> = {
    [FilterOperator.NULL]: 'is null',
    [FilterOperator.NOT_NULL]: 'is not null',
    [FilterOperator.EQUALS]: 'is',
    [FilterOperator.NOT_EQUALS]: 'is not',
    [FilterOperator.STARTS_WITH]: 'starts with',
    [FilterOperator.ENDS_WITH]: 'ends with',
    [FilterOperator.NOT_INCLUDE]: 'does not include',
    [FilterOperator.INCLUDE]: 'includes',
    [FilterOperator.LESS_THAN]: 'is less than',
    [FilterOperator.LESS_THAN_OR_EQUAL]: 'is less than or equal',
    [FilterOperator.GREATER_THAN]: 'is greater than',
    [FilterOperator.GREATER_THAN_OR_EQUAL]: 'is greater than or equal',
    [FilterOperator.IN_THE_PAST]: 'in the last',
    [FilterOperator.NOT_IN_THE_PAST]: 'not in the last',
    [FilterOperator.IN_THE_NEXT]: 'in the next',
    [FilterOperator.IN_THE_CURRENT]: 'in the current',
    [FilterOperator.NOT_IN_THE_CURRENT]: 'not in the current',
    [FilterOperator.IN_BETWEEN]: 'is between',
    [FilterOperator.NOT_IN_BETWEEN]: 'is not between',
    [FilterOperator.IN_PERIOD_TO_DATE]: 'in all',
};

export const getFilterOptions = <T extends FilterOperator>(
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
        FilterOperator.NOT_IN_THE_PAST,
        FilterOperator.IN_THE_NEXT,
        FilterOperator.IN_THE_CURRENT,
        FilterOperator.NOT_IN_THE_CURRENT,
    ]),
    { value: FilterOperator.LESS_THAN, label: 'is before' },
    { value: FilterOperator.LESS_THAN_OR_EQUAL, label: 'is on or before' },
    { value: FilterOperator.GREATER_THAN, label: 'is after' },
    { value: FilterOperator.GREATER_THAN_OR_EQUAL, label: 'is on or after' },
    { value: FilterOperator.IN_BETWEEN, label: 'is between' },
    ...getFilterOptions([FilterOperator.IN_PERIOD_TO_DATE]),
];

const supportsToDateOperators = (
    field: FilterableField | undefined,
): boolean => {
    if (!field || !isDimension(field) || !field.timeInterval) return true;
    if (field.timeIntervalBaseDimensionName) return true;
    return ![
        TimeFrames.YEAR,
        TimeFrames.QUARTER,
        TimeFrames.MONTH,
        TimeFrames.WEEK,
    ].includes(field.timeInterval);
};

export const getFilterOperatorOptions = (
    filterType: FilterType,
    field?: FilterableField,
): Array<{ value: FilterOperator; label: string }> => {
    switch (filterType) {
        case FilterType.STRING:
            return getFilterOptions([
                FilterOperator.NULL,
                FilterOperator.NOT_NULL,
                FilterOperator.EQUALS,
                FilterOperator.NOT_EQUALS,
                FilterOperator.STARTS_WITH,
                FilterOperator.ENDS_WITH,
                FilterOperator.INCLUDE,
                FilterOperator.NOT_INCLUDE,
            ]);
        case FilterType.NUMBER:
            return getFilterOptions([
                FilterOperator.NULL,
                FilterOperator.NOT_NULL,
                FilterOperator.EQUALS,
                FilterOperator.NOT_EQUALS,
                FilterOperator.LESS_THAN,
                FilterOperator.LESS_THAN_OR_EQUAL,
                FilterOperator.GREATER_THAN,
                FilterOperator.GREATER_THAN_OR_EQUAL,
                FilterOperator.IN_BETWEEN,
                FilterOperator.NOT_IN_BETWEEN,
            ]);
        case FilterType.DATE:
            return supportsToDateOperators(field)
                ? timeFilterOptions
                : timeFilterOptions.filter(
                      ({ value }) => value !== FilterOperator.IN_PERIOD_TO_DATE,
                  );
        case FilterType.BOOLEAN:
            return getFilterOptions([
                FilterOperator.NULL,
                FilterOperator.NOT_NULL,
                FilterOperator.EQUALS,
                FilterOperator.NOT_EQUALS,
            ]);
        default:
            return assertUnreachable(
                filterType,
                `Unexpected filter type: ${filterType}`,
            );
    }
};

const getValueAsString = (
    filterType: FilterType,
    rule: BaseFilterRule,
    field?: Field | TableCalculation | CustomSqlDimension,
): string | undefined => {
    const { operator, values } = rule;
    const firstValue = values?.[0];
    const secondValue = values?.[1];

    if (
        operator === FilterOperator.NULL ||
        operator === FilterOperator.NOT_NULL
    ) {
        return undefined;
    }

    switch (filterType) {
        case FilterType.STRING:
        case FilterType.NUMBER:
            switch (operator) {
                case FilterOperator.IN_BETWEEN:
                case FilterOperator.NOT_IN_BETWEEN:
                    return `${firstValue || 0}, ${secondValue || 0}`;
                default: {
                    const joined = values?.join(', ');
                    if (
                        filterType === FilterType.STRING &&
                        operator === FilterOperator.EQUALS &&
                        rule.includeNull
                    ) {
                        return joined
                            ? `${joined}, ${NULL_VALUE_LABEL}`
                            : NULL_VALUE_LABEL;
                    }
                    return joined;
                }
            }
        case FilterType.BOOLEAN:
            return values?.map(formatBoolean).join(', ');
        case FilterType.DATE:
            switch (operator) {
                case FilterOperator.IN_THE_PAST:
                case FilterOperator.NOT_IN_THE_PAST:
                case FilterOperator.IN_THE_NEXT: {
                    if (!isFilterRule(rule)) throw new Error('Invalid rule');
                    const settings = rule.settings as
                        | DateFilterSettings
                        | undefined;
                    return `${firstValue} ${
                        settings?.completed ? 'completed ' : ''
                    }${settings?.unitOfTime}`;
                }
                case FilterOperator.IN_BETWEEN:
                    if (
                        isDimension(field) &&
                        isMomentInput(firstValue) &&
                        isMomentInput(secondValue) &&
                        field.type === DimensionType.DATE
                    ) {
                        return `${formatDate(
                            firstValue as MomentInput,
                            field.timeInterval,
                        )} and ${formatDate(
                            secondValue as MomentInput,
                            field.timeInterval,
                        )}`;
                    }
                    return `${getLocalTimeDisplay(
                        firstValue as MomentInput,
                        false,
                    )} and ${getLocalTimeDisplay(secondValue as MomentInput)}`;
                case FilterOperator.IN_THE_CURRENT:
                case FilterOperator.NOT_IN_THE_CURRENT: {
                    if (!isFilterRule(rule)) throw new Error('Invalid rule');
                    const settings = rule.settings as
                        | DateFilterSettings
                        | undefined;
                    return settings?.unitOfTime?.slice(0, -1) ?? 'day';
                }
                case FilterOperator.EQUALS:
                case FilterOperator.NOT_EQUALS:
                case FilterOperator.STARTS_WITH:
                case FilterOperator.ENDS_WITH:
                case FilterOperator.INCLUDE:
                case FilterOperator.NOT_INCLUDE:
                case FilterOperator.LESS_THAN:
                case FilterOperator.LESS_THAN_OR_EQUAL:
                case FilterOperator.GREATER_THAN:
                case FilterOperator.GREATER_THAN_OR_EQUAL:
                    return values
                        ?.map((value) => {
                            let type: string = DimensionType.TIMESTAMP;
                            if (field) {
                                type = isCustomSqlDimension(field)
                                    ? field.dimensionType
                                    : (field.type ?? DimensionType.TIMESTAMP);
                            }
                            if (
                                isDimension(field) &&
                                isMomentInput(value) &&
                                type === DimensionType.TIMESTAMP
                            ) {
                                return getLocalTimeDisplay(value);
                            }
                            if (
                                isDimension(field) &&
                                isMomentInput(value) &&
                                type === DimensionType.DATE
                            ) {
                                return formatDate(value, field.timeInterval);
                            }
                            return String(value);
                        })
                        .join(', ');
                case FilterOperator.IN_PERIOD_TO_DATE: {
                    if (!isFilterRule(rule)) throw new Error('Invalid rule');
                    const settings = rule.settings as
                        | DateFilterSettings
                        | undefined;
                    let periodLabel = 'period';
                    if (settings?.unitOfTime === 'years') periodLabel = 'year';
                    if (settings?.unitOfTime === 'quarters') {
                        periodLabel = 'quarter';
                    }
                    if (settings?.unitOfTime === 'months') {
                        periodLabel = 'month';
                    }
                    if (settings?.unitOfTime === 'weeks') periodLabel = 'week';
                    return `${periodLabel} to date`;
                }
                case FilterOperator.NOT_IN_BETWEEN:
                    throw new Error('Not implemented');
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
    rule: BaseFilterRule,
    filterType: FilterType,
    label: string,
): ConditionalRuleLabel => {
    const operationLabel =
        getFilterOperatorOptions(filterType).find(
            ({ value }) => value === rule.operator,
        )?.label ?? filterOperatorLabel[rule.operator];

    return {
        field: label,
        operator: operationLabel,
        value: getValueAsString(filterType, rule),
    };
};

export const getConditionalRuleLabelFromItem = (
    rule: BaseFilterRule,
    item: FilterableItem,
): ConditionalRuleLabel => {
    const filterType = getFilterTypeFromItem(item);
    const operationLabel =
        getFilterOperatorOptions(filterType).find(
            ({ value }) => value === rule.operator,
        )?.label ?? filterOperatorLabel[rule.operator];

    return {
        field: isField(item) ? item.label : item.name,
        operator: operationLabel,
        value: getValueAsString(filterType, rule, item),
    };
};
