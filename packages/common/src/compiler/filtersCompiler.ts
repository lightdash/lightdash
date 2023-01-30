import moment from 'moment/moment';
import {
    CompiledField,
    DimensionType,
    isMetric,
    MetricType,
} from '../types/field';
import {
    DateFilterRule,
    FilterOperator,
    FilterRule,
    UnitOfTime,
    unitOfTimeFormat,
} from '../types/filter';
import assertUnreachable from '../utils/assertUnreachable';
import { formatDate } from '../utils/formatting';

const formatTimestamp = (date: Date): string =>
    moment(date).format('YYYY-MM-DD HH:mm:ss');

export const renderStringFilterSql = (
    dimensionSql: string,
    filter: FilterRule,
    stringQuoteChar: string,
    escapeStringQuoteChar: string,
): string => {
    const filterType = filter.operator;
    const escapedFilterValues = filter.values?.map((v) =>
        typeof v === 'string'
            ? v.replaceAll(
                  stringQuoteChar,
                  `${escapeStringQuoteChar}${stringQuoteChar}`,
              )
            : v,
    );

    switch (filter.operator) {
        case FilterOperator.EQUALS:
            return !escapedFilterValues || escapedFilterValues.length === 0
                ? 'false'
                : `(${dimensionSql}) IN (${escapedFilterValues
                      .map((v) => `${stringQuoteChar}${v}${stringQuoteChar}`)
                      .join(',')})`;
        case FilterOperator.NOT_EQUALS:
            return !escapedFilterValues || escapedFilterValues.length === 0
                ? 'true'
                : `(${dimensionSql}) NOT IN (${escapedFilterValues
                      .map((v) => `${stringQuoteChar}${v}${stringQuoteChar}`)
                      .join(',')})`;
        case FilterOperator.INCLUDE:
            const includesQuery = escapedFilterValues?.map(
                (v) => `LOWER(${dimensionSql}) LIKE LOWER('%${v}%')`,
            );
            return includesQuery?.join('\n  OR\n  ') || 'true';
        case FilterOperator.NOT_INCLUDE:
            const notIncludeQuery = escapedFilterValues?.map(
                (v) => `LOWER(${dimensionSql}) NOT LIKE LOWER('%${v}%')`,
            );
            return notIncludeQuery?.join('\n  AND\n  ') || 'true';
        case FilterOperator.NULL:
            return `(${dimensionSql}) IS NULL`;
        case FilterOperator.NOT_NULL:
            return `(${dimensionSql}) IS NOT NULL`;
        case FilterOperator.STARTS_WITH:
            const startWithQuery = escapedFilterValues?.map(
                (v) =>
                    `(${dimensionSql}) LIKE ${stringQuoteChar}${v}%${stringQuoteChar}`,
            );
            return startWithQuery?.join('\n  OR\n  ') || 'true';
        default:
            throw Error(
                `No function implemented to render sql for filter type ${filterType} on dimension of string type`,
            );
    }
};

export const renderNumberFilterSql = (
    dimensionSql: string,
    filter: FilterRule,
): string => {
    const filterType = filter.operator;
    switch (filter.operator) {
        case FilterOperator.EQUALS:
            return !filter.values || filter.values.length === 0
                ? 'false'
                : `(${dimensionSql}) IN (${filter.values.join(',')})`;
        case FilterOperator.NOT_EQUALS:
            return !filter.values || filter.values.length === 0
                ? 'true'
                : `(${dimensionSql}) NOT IN (${filter.values.join(',')})`;
        case FilterOperator.NULL:
            return `(${dimensionSql}) IS NULL`;
        case FilterOperator.NOT_NULL:
            return `(${dimensionSql}) IS NOT NULL`;
        case FilterOperator.GREATER_THAN:
            return `(${dimensionSql}) > (${filter.values?.[0] || 0})`;
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return `(${dimensionSql}) >= (${filter.values?.[0] || 0})`;
        case FilterOperator.LESS_THAN:
            return `(${dimensionSql}) < (${filter.values?.[0] || 0})`;
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return `(${dimensionSql}) <= (${filter.values?.[0] || 0})`;
        default:
            throw Error(
                `No function implemented to render sql for filter type ${filterType} on dimension of number type`,
            );
    }
};

export const renderDateFilterSql = (
    dimensionSql: string,
    filter: DateFilterRule,
    dateFormatter: (date: Date) => string = formatDate,
): string => {
    const filterType = filter.operator;
    switch (filter.operator) {
        case 'equals':
            return `(${dimensionSql}) = ('${dateFormatter(
                filter.values?.[0],
            )}')`;
        case 'notEquals':
            return `(${dimensionSql}) != ('${dateFormatter(
                filter.values?.[0],
            )}')`;
        case 'isNull':
            return `(${dimensionSql}) IS NULL`;
        case 'notNull':
            return `(${dimensionSql}) IS NOT NULL`;
        case 'greaterThan':
            return `(${dimensionSql}) > ('${dateFormatter(
                filter.values?.[0],
            )}')`;
        case 'greaterThanOrEqual':
            return `(${dimensionSql}) >= ('${dateFormatter(
                filter.values?.[0],
            )}')`;
        case 'lessThan':
            return `(${dimensionSql}) < ('${dateFormatter(
                filter.values?.[0],
            )}')`;
        case 'lessThanOrEqual':
            return `(${dimensionSql}) <= ('${dateFormatter(
                filter.values?.[0],
            )}')`;
        case FilterOperator.IN_THE_PAST: {
            const unitOfTime: UnitOfTime =
                filter.settings?.unitOfTime || UnitOfTime.days;
            const completed: boolean = !!filter.settings?.completed;

            if (completed) {
                const completedDate = moment(
                    moment()
                        .startOf(unitOfTime)
                        .format(unitOfTimeFormat[unitOfTime]),
                ).toDate();
                const untilDate = dateFormatter(
                    moment().startOf(unitOfTime).toDate(),
                );
                return `((${dimensionSql}) >= ('${dateFormatter(
                    moment(completedDate)
                        .subtract(filter.values?.[0], unitOfTime)
                        .toDate(),
                )}') AND (${dimensionSql}) < ('${untilDate}'))`;
            }
            const untilDate = dateFormatter(moment().toDate());
            return `((${dimensionSql}) >= ('${dateFormatter(
                moment().subtract(filter.values?.[0], unitOfTime).toDate(),
            )}') AND (${dimensionSql}) <= ('${untilDate}'))`;
        }
        case FilterOperator.IN_THE_NEXT: {
            const unitOfTime: UnitOfTime =
                filter.settings?.unitOfTime || UnitOfTime.days;
            const completed: boolean = !!filter.settings?.completed;

            if (completed) {
                const fromDate = moment(
                    moment().add(1, unitOfTime).startOf(unitOfTime),
                ).toDate();
                const toDate = dateFormatter(
                    moment(fromDate)
                        .add(filter.values?.[0], unitOfTime)
                        .toDate(),
                );
                return `((${dimensionSql}) >= ('${dateFormatter(
                    fromDate,
                )}') AND (${dimensionSql}) < ('${toDate}'))`;
            }
            const fromDate = dateFormatter(moment().toDate());
            const toDate = dateFormatter(
                moment().add(filter.values?.[0], unitOfTime).toDate(),
            );
            return `((${dimensionSql}) >= ('${fromDate}') AND (${dimensionSql}) <= ('${toDate}'))`;
        }
        case FilterOperator.IN_THE_CURRENT: {
            const unitOfTime: UnitOfTime =
                filter.settings?.unitOfTime || UnitOfTime.days;
            const fromDate = dateFormatter(
                moment().startOf(unitOfTime).toDate(),
            );
            const untilDate = dateFormatter(
                moment().endOf(unitOfTime).toDate(),
            );
            return `((${dimensionSql}) >= ('${fromDate}') AND (${dimensionSql}) <= ('${untilDate}'))`;
        }
        case FilterOperator.IN_BETWEEN: {
            const startDate = dateFormatter(filter.values?.[0]);
            const endDate = dateFormatter(filter.values?.[1]);

            return `((${dimensionSql}) >= ('${startDate}') AND (${dimensionSql}) <= ('${endDate}'))`;
        }
        default:
            throw Error(
                `No function implemented to render sql for filter type ${filterType} on dimension of date type`,
            );
    }
};

const renderBooleanFilterSql = (
    dimensionSql: string,
    filter: FilterRule,
): string => {
    const { operator } = filter;
    switch (filter.operator) {
        case 'equals':
            return `(${dimensionSql}) = ${!!filter.values?.[0]}`;
        case 'isNull':
            return `(${dimensionSql}) IS NULL`;
        case 'notNull':
            return `(${dimensionSql}) IS NOT NULL`;
        default:
            throw Error(
                `No function implemented to render sql for filter type ${operator} on dimension of boolean type`,
            );
    }
};

export const renderFilterRuleSql = (
    filterRule: FilterRule,
    field: CompiledField,
    fieldQuoteChar: string,
    stringQuoteChar: string,
    escapeStringQuoteChar: string,
): string => {
    const fieldType = field.type;
    const fieldSql = isMetric(field)
        ? `${fieldQuoteChar}${filterRule.target.fieldId}${fieldQuoteChar}`
        : field.compiledSql;

    switch (field.type) {
        case DimensionType.STRING:
        case MetricType.STRING: {
            return renderStringFilterSql(
                fieldSql,
                filterRule,
                stringQuoteChar,
                escapeStringQuoteChar,
            );
        }
        case DimensionType.NUMBER:
        case MetricType.NUMBER:
        case MetricType.PERCENTILE:
        case MetricType.MEDIAN:
        case MetricType.AVERAGE:
        case MetricType.COUNT:
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM:
        case MetricType.MIN:
        case MetricType.MAX: {
            return renderNumberFilterSql(fieldSql, filterRule);
        }
        case DimensionType.DATE:
        case MetricType.DATE: {
            return renderDateFilterSql(fieldSql, filterRule);
        }
        case DimensionType.TIMESTAMP: {
            return renderDateFilterSql(fieldSql, filterRule, formatTimestamp);
        }
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN: {
            return renderBooleanFilterSql(fieldSql, filterRule);
        }
        default: {
            return assertUnreachable(
                field,
                `No function implemented to render sql for filter group type ${fieldType}`,
            );
        }
    }
};
