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
    UnitOfTime,
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
import {
    DEFAULT_UI_STRINGS,
    type UiStringKey,
    type UiStringResolver,
} from './i18n/uiStrings';

const resolveUiString = (
    key: UiStringKey,
    getUiString?: UiStringResolver,
): string => (getUiString ? getUiString(key) : DEFAULT_UI_STRINGS[key]);

export const filterOperatorLabel: Record<FilterOperator, string> =
    Object.fromEntries(
        Object.values(FilterOperator).map((operator) => [
            operator,
            DEFAULT_UI_STRINGS[`filters.operators.${operator}`],
        ]),
    ) as Record<FilterOperator, string>;

export const getFilterOptions = <T extends FilterOperator>(
    operators: Array<T>,
    getUiString?: UiStringResolver,
): Array<{ value: T; label: string }> =>
    operators.map((operator) => ({
        value: operator,
        label: resolveUiString(`filters.operators.${operator}`, getUiString),
    }));

const getTimeFilterOptions = (
    getUiString?: UiStringResolver,
): Array<{
    value: FilterOperator;
    label: string;
}> => [
    ...getFilterOptions(
        [
            FilterOperator.NULL,
            FilterOperator.NOT_NULL,
            FilterOperator.EQUALS,
            FilterOperator.NOT_EQUALS,
            FilterOperator.IN_THE_PAST,
            FilterOperator.NOT_IN_THE_PAST,
            FilterOperator.IN_THE_NEXT,
            FilterOperator.IN_THE_CURRENT,
            FilterOperator.NOT_IN_THE_CURRENT,
        ],
        getUiString,
    ),
    {
        value: FilterOperator.LESS_THAN,
        label: resolveUiString('filters.dateOperators.lessThan', getUiString),
    },
    {
        value: FilterOperator.LESS_THAN_OR_EQUAL,
        label: resolveUiString(
            'filters.dateOperators.lessThanOrEqual',
            getUiString,
        ),
    },
    {
        value: FilterOperator.GREATER_THAN,
        label: resolveUiString(
            'filters.dateOperators.greaterThan',
            getUiString,
        ),
    },
    {
        value: FilterOperator.GREATER_THAN_OR_EQUAL,
        label: resolveUiString(
            'filters.dateOperators.greaterThanOrEqual',
            getUiString,
        ),
    },
    {
        value: FilterOperator.IN_BETWEEN,
        label: resolveUiString('filters.dateOperators.inBetween', getUiString),
    },
    ...getFilterOptions([FilterOperator.IN_PERIOD_TO_DATE], getUiString),
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
    getUiString?: UiStringResolver,
): Array<{ value: FilterOperator; label: string }> => {
    switch (filterType) {
        case FilterType.STRING:
            return getFilterOptions(
                [
                    FilterOperator.NULL,
                    FilterOperator.NOT_NULL,
                    FilterOperator.EQUALS,
                    FilterOperator.NOT_EQUALS,
                    FilterOperator.STARTS_WITH,
                    FilterOperator.ENDS_WITH,
                    FilterOperator.INCLUDE,
                    FilterOperator.NOT_INCLUDE,
                ],
                getUiString,
            );
        case FilterType.NUMBER:
            return getFilterOptions(
                [
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
                ],
                getUiString,
            );
        case FilterType.DATE:
            return supportsToDateOperators(field)
                ? getTimeFilterOptions(getUiString)
                : getTimeFilterOptions(getUiString).filter(
                      ({ value }) => value !== FilterOperator.IN_PERIOD_TO_DATE,
                  );
        case FilterType.BOOLEAN:
            return getFilterOptions(
                [
                    FilterOperator.NULL,
                    FilterOperator.NOT_NULL,
                    FilterOperator.EQUALS,
                    FilterOperator.NOT_EQUALS,
                ],
                getUiString,
            );
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
    getUiString?: UiStringResolver,
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
                        const nullLabel = resolveUiString(
                            'filters.nullValue',
                            getUiString,
                        );
                        return joined ? `${joined}, ${nullLabel}` : nullLabel;
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
                    // A missing unit of time falls back to days, matching the
                    // in-the-current branch below
                    return `${firstValue} ${resolveUiString(
                        `filters.unitsOfTime.${
                            settings?.unitOfTime ?? UnitOfTime.days
                        }.${
                            settings?.completed ? 'completedPlural' : 'plural'
                        }`,
                        getUiString,
                    )}`;
                }
                case FilterOperator.IN_BETWEEN: {
                    const joiner = resolveUiString(
                        'filters.betweenJoiner',
                        getUiString,
                    );
                    if (
                        isDimension(field) &&
                        isMomentInput(firstValue) &&
                        isMomentInput(secondValue) &&
                        field.type === DimensionType.DATE
                    ) {
                        return `${formatDate(
                            firstValue as MomentInput,
                            field.timeInterval,
                        )} ${joiner} ${formatDate(
                            secondValue as MomentInput,
                            field.timeInterval,
                        )}`;
                    }
                    return `${getLocalTimeDisplay(
                        firstValue as MomentInput,
                        false,
                    )} ${joiner} ${getLocalTimeDisplay(
                        secondValue as MomentInput,
                    )}`;
                }
                case FilterOperator.IN_THE_CURRENT:
                case FilterOperator.NOT_IN_THE_CURRENT: {
                    if (!isFilterRule(rule)) throw new Error('Invalid rule');
                    const settings = rule.settings as
                        | DateFilterSettings
                        | undefined;
                    return resolveUiString(
                        `filters.unitsOfTime.${
                            settings?.unitOfTime ?? UnitOfTime.days
                        }.singular`,
                        getUiString,
                    );
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
                    const unitOfTime = settings?.unitOfTime;
                    const periodKey =
                        unitOfTime === UnitOfTime.years ||
                        unitOfTime === UnitOfTime.quarters ||
                        unitOfTime === UnitOfTime.months ||
                        unitOfTime === UnitOfTime.weeks
                            ? (`filters.periodToDate.${unitOfTime}` as const)
                            : ('filters.periodToDate.fallback' as const);
                    return resolveUiString(periodKey, getUiString);
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
    getUiString?: UiStringResolver,
): ConditionalRuleLabel => {
    const operationLabel =
        getFilterOperatorOptions(filterType, undefined, getUiString).find(
            ({ value }) => value === rule.operator,
        )?.label ??
        resolveUiString(`filters.operators.${rule.operator}`, getUiString);

    return {
        field: label,
        operator: operationLabel,
        value: getValueAsString(filterType, rule, undefined, getUiString),
    };
};

export const getConditionalRuleLabelFromItem = (
    rule: BaseFilterRule,
    item: FilterableItem,
    getUiString?: UiStringResolver,
): ConditionalRuleLabel => {
    const filterType = getFilterTypeFromItem(item);
    const operationLabel =
        getFilterOperatorOptions(filterType, undefined, getUiString).find(
            ({ value }) => value === rule.operator,
        )?.label ??
        resolveUiString(`filters.operators.${rule.operator}`, getUiString);

    return {
        field: isField(item) ? item.label : item.name,
        operator: operationLabel,
        value: getValueAsString(filterType, rule, item, getUiString),
    };
};
