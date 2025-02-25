import assertUnreachable from '../utils/assertUnreachable';
import { type DbtColumnLightdashMetric } from './dbt';
import { NotImplementedError, ParameterError } from './errors';
import {
    FilterOperator,
    UnitOfTime,
    isDateFilterRule,
    type DateFilterSettings,
    type MetricFilterRule,
} from './filter';
import filterGrammar from './filterGrammar';

const isValidMetricFilterRule = (filter: MetricFilterRule): boolean => {
    const { values, operator } = filter;
    const operatorAllowsEmptyValues = [
        FilterOperator.NULL,
        FilterOperator.NOT_NULL,
    ].includes(operator);
    const firstValue = values?.[0] as string | number | undefined;
    return operatorAllowsEmptyValues || firstValue !== undefined;
};
/**
 * Converts a filter rule from custom metrics to dbt meta tags in yml
 * More info about dbt filters: https://docs.lightdash.com/references/metrics/#available-filter-types
 */
const convertFilterOperatorToDbt = (filter: MetricFilterRule): string[] => {
    const { values, operator } = filter;

    if (!isValidMetricFilterRule(filter)) {
        throw new ParameterError(
            `Filter values are undefined for filter: ${JSON.stringify(filter)}`,
        );
    }
    // Operators without values are handled here
    switch (operator) {
        case FilterOperator.NULL:
            return [`null`];
        case FilterOperator.NOT_NULL:
            return [`!null`];
        default:
            break; // continue
    }
    const validValues = values as (string | number)[];
    const firstValue = validValues[0];

    switch (operator) {
        case FilterOperator.EQUALS:
            return validValues?.map((value) => `${value}`);
        case FilterOperator.NOT_EQUALS:
            return [`!${firstValue}`];
        case FilterOperator.INCLUDE:
            return [`%${firstValue}%`];
        case FilterOperator.NOT_INCLUDE:
            return [`!%${firstValue}%`];
        case FilterOperator.STARTS_WITH:
            return [`${firstValue}%`];
        case FilterOperator.ENDS_WITH:
            return [`%${firstValue}`];
        case FilterOperator.GREATER_THAN:
            return [`> ${firstValue}`];
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return [`>= ${firstValue}`];
        case FilterOperator.LESS_THAN:
            return [`< ${firstValue}`];
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return [`<= ${firstValue}`];
        case FilterOperator.IN_THE_NEXT:
        case FilterOperator.IN_THE_PAST:
            if (isDateFilterRule(filter)) {
                const settings = filter.settings as DateFilterSettings;
                const unitOfTime = settings.unitOfTime || UnitOfTime.days;

                if (settings.completed) {
                    throw new NotImplementedError(
                        'Custom metric completed filter is not supported on dbt',
                    );
                }

                return [`${operator} ${firstValue} ${unitOfTime}`];
            }
            throw new NotImplementedError(
                `No function implemented to convert date custom metric filter to dbt: ${operator}`,
            );
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.IN_BETWEEN:
        case FilterOperator.NOT_IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_CURRENT:
        case FilterOperator.NOT_IN_BETWEEN:
            throw new NotImplementedError(
                `No function implemented to convert custom metric filter to dbt: ${operator}`,
            );

        default:
            assertUnreachable(
                operator,
                `No function implemented to convert custom metric filter to dbt: ${operator}`,
            );
    }
    return [];
};
export const convertMetricFilterToDbt = (
    filters: MetricFilterRule[] | undefined,
): DbtColumnLightdashMetric['filters'] => {
    if (!filters) return undefined;

    return filters.reduce<DbtColumnLightdashMetric['filters']>(
        (acc, filter) => {
            const { target } = filter;

            if (!isValidMetricFilterRule(filter)) return acc;
            const values: string[] = convertFilterOperatorToDbt(filter);
            const fieldRefParts = target.fieldRef.split('.');
            const fieldId =
                fieldRefParts.length > 1 ? fieldRefParts[1] : target.fieldRef;
            const dbtFilters = {
                [fieldId]: values.length > 1 ? values : values[0],
            };
            return [...(acc || []), dbtFilters];
        },
        [],
    );
};

export default filterGrammar;
