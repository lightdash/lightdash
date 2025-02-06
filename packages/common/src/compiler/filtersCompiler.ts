import moment from 'moment-timezone';
import { SupportedDbtAdapter } from '../types/dbt';
import { CompileError } from '../types/errors';
import {
    CustomFormatType,
    DimensionType,
    isCompiledCustomSqlDimension,
    isMetric,
    MetricType,
    TableCalculationType,
    type CompiledCustomSqlDimension,
    type CompiledField,
    type CompiledTableCalculation,
} from '../types/field';
import {
    FilterOperator,
    isFilterTarget,
    isMetricFilterTarget,
    UnitOfTime,
    unitOfTimeFormat,
    type DateFilterRule,
    type FilterRule,
} from '../types/filter';
import assertUnreachable from '../utils/assertUnreachable';
import { formatDate } from '../utils/formatting';
import { getItemId } from '../utils/item';
import { getMomentDateWithCustomStartOfWeek } from '../utils/time';
import { type WeekDay } from '../utils/timeFrames';

// NOTE: This function requires a complete date as input.
// It produces a timezoneless string which is implied to be in UTC.
// We could probably have it be a string WITH a timezone in the future.
// Calling .utc() here makes it safe to drop the tz.
const formatTimestampAsUTCWithNoTimezone = (date: Date): string =>
    moment(date).utc().format('YYYY-MM-DD HH:mm:ss');

const raiseInvalidFilterError = (
    type: string,
    filter: FilterRule<FilterOperator, unknown>,
): never => {
    let targetString = '';

    if (isMetricFilterTarget(filter.target)) {
        targetString = ` on "${filter.target.fieldRef}" field`;
    } else if (isFilterTarget(filter.target)) {
        targetString = ` on "${filter.target.fieldId}" field`;
    }

    throw new CompileError(
        `No function has been implemented to render SQL for the filter operator "${filter.operator}"${targetString} of type "${type}"`,
    );
};

export const renderStringFilterSql = (
    dimensionSql: string,
    filter: FilterRule<FilterOperator, unknown>,
    stringQuoteChar: string,
    escapeStringQuoteChar: string,
): string => {
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
                ? 'true'
                : `(${dimensionSql}) IN (${escapedFilterValues
                      .map((v) => `${stringQuoteChar}${v}${stringQuoteChar}`)
                      .join(',')})`;
        case FilterOperator.NOT_EQUALS:
            return !escapedFilterValues || escapedFilterValues.length === 0
                ? 'true'
                : `((${dimensionSql}) NOT IN (${escapedFilterValues
                      .map((v) => `${stringQuoteChar}${v}${stringQuoteChar}`)
                      .join(',')} ) OR (${dimensionSql}) IS NULL)`;
        case FilterOperator.INCLUDE:
            if (
                escapedFilterValues === undefined ||
                escapedFilterValues.length === 0
            )
                return 'true';
            const includesQuery = escapedFilterValues.map(
                (v) => `LOWER(${dimensionSql}) LIKE LOWER('%${v}%')`,
            );
            if (includesQuery.length > 1)
                return `(${includesQuery.join('\n  OR\n  ')})`;
            return includesQuery.join('\n  OR\n  ');
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
        case FilterOperator.ENDS_WITH:
            const endsWithQuery = escapedFilterValues?.map(
                (v) =>
                    `(${dimensionSql}) LIKE ${stringQuoteChar}%${v}${stringQuoteChar}`,
            );
            return endsWithQuery?.join('\n  OR\n  ') || 'true';
        default:
            return raiseInvalidFilterError('string', filter);
    }
};

export const renderNumberFilterSql = (
    dimensionSql: string,
    filter: FilterRule<FilterOperator, unknown>,
): string => {
    switch (filter.operator) {
        case FilterOperator.EQUALS:
            return !filter.values || filter.values.length === 0
                ? 'true'
                : `(${dimensionSql}) IN (${filter.values.join(',')})`;
        case FilterOperator.NOT_EQUALS:
            return !filter.values || filter.values.length === 0
                ? 'true'
                : `((${dimensionSql}) NOT IN (${filter.values.join(
                      ',',
                  )}) OR (${dimensionSql}) IS NULL)`;
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
            return raiseInvalidFilterError('number', filter);
    }
};

export const renderDateFilterSql = (
    dimensionSql: string,
    filter: DateFilterRule,
    adapterType: SupportedDbtAdapter,
    timezone: string,
    dateFormatter: (date: Date) => string = formatDate,
    startOfWeek: WeekDay | null | undefined = undefined,
): string => {
    const castValue = (value: string): string => {
        switch (adapterType) {
            case SupportedDbtAdapter.TRINO: {
                return `CAST('${value}' AS timestamp)`;
            }
            default:
                return `('${value}')`;
        }
    };

    switch (filter.operator) {
        case 'equals':
            return `(${dimensionSql}) = ${castValue(
                dateFormatter(filter.values?.[0]),
            )}`;
        case 'notEquals':
            return `((${dimensionSql}) != ${castValue(
                dateFormatter(filter.values?.[0]),
            )} OR (${dimensionSql}) IS NULL)`;
        case 'isNull':
            return `(${dimensionSql}) IS NULL`;
        case 'notNull':
            return `(${dimensionSql}) IS NOT NULL`;
        case 'greaterThan':
            return `(${dimensionSql}) > ${castValue(
                dateFormatter(filter.values?.[0]),
            )}`;
        case 'greaterThanOrEqual':
            return `(${dimensionSql}) >= ${castValue(
                dateFormatter(filter.values?.[0]),
            )}`;
        case 'lessThan':
            return `(${dimensionSql}) < ${castValue(
                dateFormatter(filter.values?.[0]),
            )}`;
        case 'lessThanOrEqual':
            return `(${dimensionSql}) <= ${castValue(
                dateFormatter(filter.values?.[0]),
            )}`;
        case FilterOperator.NOT_IN_THE_PAST:
        case FilterOperator.IN_THE_PAST: {
            const unitOfTime: UnitOfTime =
                filter.settings?.unitOfTime || UnitOfTime.days;
            const completed: boolean = !!filter.settings?.completed;
            const not =
                filter.operator === FilterOperator.NOT_IN_THE_PAST
                    ? 'NOT '
                    : '';

            if (completed) {
                const completedDate = moment(
                    getMomentDateWithCustomStartOfWeek(startOfWeek)
                        .startOf(unitOfTime)
                        .format(unitOfTimeFormat[unitOfTime]),
                ).toDate();
                const untilDate = dateFormatter(
                    getMomentDateWithCustomStartOfWeek(startOfWeek)
                        .startOf(unitOfTime)
                        .toDate(),
                );
                return `${not}((${dimensionSql}) >= ${castValue(
                    dateFormatter(
                        getMomentDateWithCustomStartOfWeek(
                            startOfWeek,
                            completedDate,
                        )
                            .subtract(filter.values?.[0], unitOfTime)
                            .toDate(),
                    ),
                )} AND (${dimensionSql}) < ${castValue(untilDate)})`;
            }
            const untilDate = dateFormatter(
                getMomentDateWithCustomStartOfWeek(startOfWeek).toDate(),
            );
            return `${not}((${dimensionSql}) >= ${castValue(
                dateFormatter(
                    getMomentDateWithCustomStartOfWeek(startOfWeek)
                        .subtract(filter.values?.[0], unitOfTime)
                        .toDate(),
                ),
            )} AND (${dimensionSql}) <= ${castValue(untilDate)})`;
        }
        case FilterOperator.IN_THE_NEXT: {
            const unitOfTime: UnitOfTime =
                filter.settings?.unitOfTime || UnitOfTime.days;
            const completed: boolean = !!filter.settings?.completed;

            if (completed) {
                const fromDate = moment(
                    getMomentDateWithCustomStartOfWeek(startOfWeek)
                        .add(1, unitOfTime)
                        .startOf(unitOfTime),
                ).toDate();
                const toDate = dateFormatter(
                    getMomentDateWithCustomStartOfWeek(startOfWeek, fromDate)
                        .add(filter.values?.[0], unitOfTime)
                        .toDate(),
                );
                return `((${dimensionSql}) >= ${castValue(
                    dateFormatter(fromDate),
                )} AND (${dimensionSql}) < ${castValue(toDate)})`;
            }
            const fromDate = dateFormatter(
                getMomentDateWithCustomStartOfWeek(startOfWeek).toDate(),
            );
            const toDate = dateFormatter(
                getMomentDateWithCustomStartOfWeek(startOfWeek)
                    .add(filter.values?.[0], unitOfTime)
                    .toDate(),
            );
            return `((${dimensionSql}) >= ${castValue(
                fromDate,
            )} AND (${dimensionSql}) <= ${castValue(toDate)})`;
        }
        case FilterOperator.IN_THE_CURRENT: {
            const unitOfTime: UnitOfTime =
                filter.settings?.unitOfTime || UnitOfTime.days;

            const fromDate = dateFormatter(
                getMomentDateWithCustomStartOfWeek(startOfWeek)
                    .tz(timezone)
                    .startOf(unitOfTime)
                    .utc()
                    .toDate(),
            );
            const untilDate = dateFormatter(
                getMomentDateWithCustomStartOfWeek(startOfWeek)
                    .tz(timezone)
                    .endOf(unitOfTime)
                    .utc()
                    .toDate(),
            );

            const castedFromDate = castValue(fromDate);
            const castedUntilDate = castValue(untilDate);

            return `((${dimensionSql}) >= ${castedFromDate} AND (${dimensionSql}) <= ${castedUntilDate})`;
        }
        case FilterOperator.NOT_IN_THE_CURRENT: {
            const unitOfTime: UnitOfTime =
                filter.settings?.unitOfTime || UnitOfTime.days;

            const fromDate = dateFormatter(
                getMomentDateWithCustomStartOfWeek(startOfWeek)
                    .tz(timezone)
                    .startOf(unitOfTime)
                    .utc()
                    .toDate(),
            );
            const untilDate = dateFormatter(
                getMomentDateWithCustomStartOfWeek(startOfWeek)
                    .tz(timezone)
                    .endOf(unitOfTime)
                    .utc()
                    .toDate(),
            );

            const castedFromDate = castValue(fromDate);
            const castedUntilDate = castValue(untilDate);

            return `(NOT ((${dimensionSql}) >= ${castedFromDate} AND (${dimensionSql}) <= ${castedUntilDate}))`;
        }
        case FilterOperator.IN_BETWEEN: {
            const startDate = dateFormatter(filter.values?.[0]);
            const endDate = dateFormatter(filter.values?.[1]);

            return `((${dimensionSql}) >= ${castValue(
                startDate,
            )} AND (${dimensionSql}) <= ${castValue(endDate)})`;
        }
        default:
            return raiseInvalidFilterError('date', filter);
    }
};

const renderBooleanFilterSql = (
    dimensionSql: string,
    filter: FilterRule<FilterOperator, unknown>,
): string => {
    switch (filter.operator) {
        case 'equals':
            return `(${dimensionSql}) = ${!!filter.values?.[0]}`;
        case 'notEquals':
            return `((${dimensionSql}) != ${!!filter
                .values?.[0]} OR (${dimensionSql}) IS NULL)`;
        case 'isNull':
            return `(${dimensionSql}) IS NULL`;
        case 'notNull':
            return `(${dimensionSql}) IS NOT NULL`;
        default:
            return raiseInvalidFilterError('boolean', filter);
    }
};

export const renderTableCalculationFilterRuleSql = (
    filterRule: FilterRule<FilterOperator, unknown>,
    field: CompiledTableCalculation | undefined,
    fieldQuoteChar: string,
    stringQuoteChar: string,
    escapeStringQuoteChar: string,
    adapterType: SupportedDbtAdapter,
    startOfWeek: WeekDay | null | undefined,
    timezone: string = 'UTC',
): string => {
    if (!field) return '1=1';

    const fieldSql = `${fieldQuoteChar}${getItemId(field)}${fieldQuoteChar}`;

    // First we default to field.type
    // otherwise, we check the custom format for backwards compatibility
    switch (field.type) {
        case TableCalculationType.STRING:
            return renderStringFilterSql(
                fieldSql,
                filterRule,
                stringQuoteChar,
                escapeStringQuoteChar,
            );
        case TableCalculationType.DATE:
        case TableCalculationType.TIMESTAMP:
            return renderDateFilterSql(
                fieldSql,
                filterRule,
                adapterType,
                timezone,
                undefined,
                startOfWeek,
            );
        case TableCalculationType.NUMBER:
            return renderNumberFilterSql(fieldSql, filterRule);
        case TableCalculationType.BOOLEAN:
            return renderBooleanFilterSql(fieldSql, filterRule);
        default:
        // Do nothing here. This will try with format.type for backwards compatibility
    }

    switch (field.format?.type) {
        case CustomFormatType.PERCENT:
        case CustomFormatType.CURRENCY:
        case CustomFormatType.NUMBER: {
            return renderNumberFilterSql(fieldSql, filterRule);
        }
        default:
            return renderStringFilterSql(
                fieldSql,
                filterRule,
                stringQuoteChar,
                escapeStringQuoteChar,
            );
    }
};

export const renderFilterRuleSql = (
    filterRule: FilterRule<FilterOperator, unknown>,
    field: CompiledField | CompiledCustomSqlDimension,
    fieldQuoteChar: string,
    stringQuoteChar: string,
    escapeStringQuoteChar: string,
    startOfWeek: WeekDay | null | undefined,
    adapterType: SupportedDbtAdapter,
    timezone: string = 'UTC',
): string => {
    if (filterRule.disabled) {
        return `1=1`; // When filter is disabled, we want to return all rows
    }
    const fieldType = isCompiledCustomSqlDimension(field)
        ? field.dimensionType
        : field.type;
    const fieldSql = isMetric(field)
        ? `${fieldQuoteChar}${getItemId(field)}${fieldQuoteChar}`
        : field.compiledSql;

    switch (fieldType) {
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
            return renderDateFilterSql(
                fieldSql,
                filterRule,
                adapterType,
                timezone,
                undefined,
                startOfWeek,
            );
        }
        case DimensionType.TIMESTAMP:
        case MetricType.TIMESTAMP: {
            return renderDateFilterSql(
                fieldSql,
                filterRule,
                adapterType,
                timezone,
                formatTimestampAsUTCWithNoTimezone,
                startOfWeek,
            );
        }
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN: {
            return renderBooleanFilterSql(fieldSql, filterRule);
        }
        default: {
            return assertUnreachable(
                fieldType,
                `No function implemented to render sql for filter group type ${fieldType}`,
            );
        }
    }
};
