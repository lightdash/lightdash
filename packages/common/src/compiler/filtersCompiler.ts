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
    type TableCalculation,
} from '../types/field';
import {
    FilterOperator,
    isFilterTarget,
    isMetricFilterTarget,
    UnitOfTime,
    type DateFilterRule,
    type FilterRule,
} from '../types/filter';
import { type WarehouseTypes } from '../types/projects';
import assertUnreachable from '../utils/assertUnreachable';
import { convertToBooleanValue } from '../utils/booleanConverter';
import { formatDate } from '../utils/formatting';
import { getItemId } from '../utils/item';
import { getMomentDateWithCustomStartOfWeek } from '../utils/time';
import { dateTruncTimezoneConversions, WeekDay } from '../utils/timeFrames';

/**
 * Formats computed Date boundaries for relative date operators (IN_THE_PAST, etc.)
 * by converting UTC back to the project timezone before formatting as YYYY-MM-DD.
 * Used only when timezone-aware DATE_TRUNC is enabled.
 */
export const createBoundaryDateFormatter =
    (timezone: string) =>
    (date: Date): string =>
        moment(date).utc().tz(timezone).format('YYYY-MM-DD');

/**
 * Returns the default week start day for a given warehouse adapter.
 * This ensures JavaScript-side week boundary calculations match the warehouse.
 *
 * References:
 * - PostgreSQL: https://www.postgresql.org/docs/current/functions-datetime.html (ISO 8601 weeks start on Monday)
 * - Snowflake: https://docs.snowflake.com/en/sql-reference/functions-date-time (WEEK_START=0 defaults to Monday)
 * - Redshift: https://docs.aws.amazon.com/redshift/latest/dg/r_DATE_TRUNC.html (truncates week to Monday)
 * - Databricks: https://docs.databricks.com/aws/en/sql/language-manual/functions/date_trunc (WEEK truncates to Monday)
 * - Trino: https://trino.io/docs/current/functions/datetime.html (ISO 8601 weeks start on Monday)
 * - BigQuery: https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/date_functions (WEEK is equivalent to WEEK(SUNDAY))
 * - ClickHouse: https://clickhouse.com/docs/sql-reference/functions/date-time-functions (toStartOfWeek default mode=0 is Sunday)
 */
const getDefaultStartOfWeek = (
    adapterType: SupportedDbtAdapter | WarehouseTypes,
): WeekDay => {
    switch (adapterType) {
        case SupportedDbtAdapter.BIGQUERY:
        case SupportedDbtAdapter.CLICKHOUSE:
            return WeekDay.SUNDAY;
        default:
            return WeekDay.MONDAY;
    }
};

// NOTE: This function requires a complete date as input.
// The Z format token appends the UTC offset (e.g. +00:00), ensuring the
// warehouse interprets the literal as UTC regardless of session timezone
// (which may be set via dataTimezone).
const formatTimestampAsUTC = (date: Date): string =>
    moment(date).utc().format('YYYY-MM-DD HH:mm:ssZ');

// ClickHouse's date_time_input_format may be set to 'basic', which cannot
// parse timezone offsets like +00:00. BigQuery's DATETIME type also rejects
// timezone offsets. Both already interpret bare strings correctly as UTC.
const formatTimestampAsUTCNoOffset = (date: Date): string =>
    moment(date).utc().format('YYYY-MM-DD HH:mm:ss');

/**
 * Cast a date/timestamp string to warehouse-specific SQL literal.
 * Trino/Athena require explicit timestamp casting; others work with bare strings.
 */
export const castDateLiteral = (
    dateString: string,
    adapterType: SupportedDbtAdapter | WarehouseTypes,
): string => {
    switch (adapterType) {
        case SupportedDbtAdapter.TRINO:
        case SupportedDbtAdapter.ATHENA:
            return `CAST('${dateString}' AS timestamp)`;
        default:
            return `'${dateString}'`;
    }
};

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
    caseSensitive: boolean = true,
): string => {
    const nonEmptyFilterValues = filter.values?.filter((v) => v !== '');

    // Apply UPPER() to both dimension and values when case insensitive (caseSensitive = false)
    const wrapDimension = (sql: string) =>
        !caseSensitive ? `UPPER(${sql})` : sql;
    const wrapValue = (value: unknown) =>
        !caseSensitive ? String(value).toUpperCase() : value;

    switch (filter.operator) {
        case FilterOperator.EQUALS:
            return filter.values && filter.values.length > 0
                ? `(${wrapDimension(dimensionSql)}) IN (${filter.values
                      .map(
                          (v) =>
                              `${stringQuoteChar}${wrapValue(v)}${stringQuoteChar}`,
                      )
                      .join(',')})`
                : 'true';
        case FilterOperator.NOT_EQUALS:
            return filter.values && filter.values.length > 0
                ? `((${wrapDimension(dimensionSql)}) NOT IN (${filter.values
                      .map(
                          (v) =>
                              `${stringQuoteChar}${wrapValue(v)}${stringQuoteChar}`,
                      )
                      .join(',')}) OR (${dimensionSql}) IS NULL)`
                : 'true';
        case FilterOperator.INCLUDE:
            if (nonEmptyFilterValues && nonEmptyFilterValues.length > 0) {
                const includesQuery = nonEmptyFilterValues.map((v) =>
                    !caseSensitive
                        ? `UPPER(${dimensionSql}) LIKE UPPER('%${v}%')`
                        : `(${dimensionSql}) LIKE '%${v}%'`,
                );
                if (includesQuery.length > 1)
                    return `(${includesQuery.join('\n  OR\n  ')})`;
                return includesQuery.join('\n  OR\n  ');
            }
            return 'true';
        case FilterOperator.NOT_INCLUDE:
            if (nonEmptyFilterValues && nonEmptyFilterValues.length > 0) {
                const notIncludeQuery = nonEmptyFilterValues.map((v) =>
                    !caseSensitive
                        ? `UPPER(${dimensionSql}) NOT LIKE UPPER('%${v}%')`
                        : `(${dimensionSql}) NOT LIKE '%${v}%'`,
                );
                return `(${notIncludeQuery.join('\n  AND\n  ')} OR (${dimensionSql}) IS NULL)`;
            }
            return 'true';
        case FilterOperator.NULL:
            return `(${dimensionSql}) IS NULL`;
        case FilterOperator.NOT_NULL:
            return `(${dimensionSql}) IS NOT NULL`;
        case FilterOperator.STARTS_WITH:
            const startWithQuery = nonEmptyFilterValues?.map((v) =>
                !caseSensitive
                    ? `UPPER(${dimensionSql}) LIKE ${stringQuoteChar}${wrapValue(v)}%${stringQuoteChar}`
                    : `(${dimensionSql}) LIKE ${stringQuoteChar}${v}%${stringQuoteChar}`,
            );
            return startWithQuery?.join('\n  OR\n  ') || 'true';
        case FilterOperator.ENDS_WITH:
            const endsWithQuery = nonEmptyFilterValues?.map((v) =>
                !caseSensitive
                    ? `UPPER(${dimensionSql}) LIKE ${stringQuoteChar}%${wrapValue(v)}${stringQuoteChar}`
                    : `(${dimensionSql}) LIKE ${stringQuoteChar}%${v}${stringQuoteChar}`,
            );
            return endsWithQuery?.join('\n  OR\n  ') || 'true';
        default:
            return raiseInvalidFilterError('string', filter);
    }
};

// Validate that all values are valid numbers
const validateAndSanitizeNumber = (value: unknown): number => {
    const num = Number(value);
    if (Number.isNaN(num) || !Number.isFinite(num)) {
        throw new CompileError(
            `Invalid number value in filter: "${value}". Expected a valid number.`,
        );
    }
    return num;
};

const isValidNumberFilterValue = <FilterType>(
    values: FilterType[] | undefined,
): values is FilterType[] => !!values && values.length > 0;

export const renderNumberFilterSql = (
    dimensionSql: string,
    filter: FilterRule<FilterOperator, unknown>,
): string => {
    switch (filter.operator) {
        case FilterOperator.EQUALS:
            return isValidNumberFilterValue(filter.values)
                ? `(${dimensionSql}) IN (${filter.values
                      .map(validateAndSanitizeNumber)
                      .join(',')})`
                : 'true';
        case FilterOperator.NOT_EQUALS:
            return !filter.values || filter.values.length === 0
                ? 'true'
                : `((${dimensionSql}) NOT IN (${filter.values
                      .map(validateAndSanitizeNumber)
                      .join(',')}) OR (${dimensionSql}) IS NULL)`;
        case FilterOperator.NULL:
            return `(${dimensionSql}) IS NULL`;
        case FilterOperator.NOT_NULL:
            return `(${dimensionSql}) IS NOT NULL`;
        case FilterOperator.GREATER_THAN:
            return isValidNumberFilterValue(filter.values)
                ? `(${dimensionSql}) > (${validateAndSanitizeNumber(
                      filter.values[0],
                  )})`
                : 'true';
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return isValidNumberFilterValue(filter.values)
                ? `(${dimensionSql}) >= (${validateAndSanitizeNumber(
                      filter.values[0],
                  )})`
                : 'true';
        case FilterOperator.LESS_THAN:
            return isValidNumberFilterValue(filter.values)
                ? `(${dimensionSql}) < (${validateAndSanitizeNumber(
                      filter.values[0],
                  )})`
                : 'true';
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return isValidNumberFilterValue(filter.values)
                ? `(${dimensionSql}) <= (${validateAndSanitizeNumber(
                      filter.values[0],
                  )})`
                : 'true';
        case FilterOperator.IN_BETWEEN:
            return !isValidNumberFilterValue(filter.values) ||
                filter.values.length < 2
                ? 'true'
                : `(${dimensionSql}) >= (${validateAndSanitizeNumber(
                      filter.values[0],
                  )}) AND (${dimensionSql}) <= (${validateAndSanitizeNumber(
                      filter.values[1],
                  )})`;
        case FilterOperator.NOT_IN_BETWEEN:
            return !isValidNumberFilterValue(filter.values) ||
                filter.values.length < 2
                ? 'true'
                : `(${dimensionSql}) < (${validateAndSanitizeNumber(
                      filter.values[0],
                  )}) OR (${dimensionSql}) > (${validateAndSanitizeNumber(
                      filter.values[1],
                  )})`;
        default:
            return raiseInvalidFilterError('number', filter);
    }
};

/**
 * Shared filter SQL for date and timestamp dimensions.
 * literalFormatter handles user-provided values; boundaryFormatter handles computed boundaries.
 */
const renderDateOrTimestampFilterSql = (
    dimensionSql: string,
    filter: DateFilterRule,
    adapterType: SupportedDbtAdapter,
    timezone: string,
    literalFormatter: (date: Date) => string,
    boundaryFormatter: (date: Date) => string,
    startOfWeek: WeekDay | null | undefined = undefined,
    baseDimensionSql?: string,
    useTimezoneAwareDateTrunc?: boolean,
): string => {
    // When startOfWeek is not explicitly configured, use the warehouse's default
    // to ensure JS-side week boundaries match the warehouse's DATE_TRUNC behavior.
    const effectiveStartOfWeek =
        startOfWeek ?? getDefaultStartOfWeek(adapterType);

    const castValue = (value: string): string => {
        if (useTimezoneAwareDateTrunc) {
            // Column is a timestamptz (round-trip through project TZ). Tag
            // the literal in project TZ so coercion aligns with the column.
            const { toUTC } = dateTruncTimezoneConversions[adapterType];
            const naive = (() => {
                switch (adapterType) {
                    case SupportedDbtAdapter.TRINO:
                    case SupportedDbtAdapter.ATHENA:
                        return `CAST('${value}' AS timestamp)`;
                    case SupportedDbtAdapter.SNOWFLAKE:
                        return `'${value}'::timestamp_ntz`;
                    case SupportedDbtAdapter.DATABRICKS:
                        return `'${value}'`;
                    case SupportedDbtAdapter.BIGQUERY:
                        // No `::` cast; TIMESTAMP(s, tz) yields the UTC instant.
                        return `TIMESTAMP('${value}', '${timezone}')`;
                    case SupportedDbtAdapter.CLICKHOUSE:
                        return `toDateTime('${value}', '${timezone}')`;
                    default:
                        return `'${value}'::timestamp`;
                }
            })();
            return toUTC(naive, timezone);
        }
        switch (adapterType) {
            case SupportedDbtAdapter.TRINO:
            case SupportedDbtAdapter.ATHENA: {
                return `CAST('${value}' AS timestamp)`;
            }
            default:
                return `('${value}')`;
        }
    };

    switch (filter.operator) {
        case FilterOperator.EQUALS:
            return `(${dimensionSql}) = ${castValue(
                literalFormatter(filter.values?.[0]),
            )}`;
        case FilterOperator.NOT_EQUALS:
            return `((${dimensionSql}) != ${castValue(
                literalFormatter(filter.values?.[0]),
            )} OR (${dimensionSql}) IS NULL)`;
        case FilterOperator.NULL:
            return `(${dimensionSql}) IS NULL`;
        case FilterOperator.NOT_NULL:
            return `(${dimensionSql}) IS NOT NULL`;
        case FilterOperator.GREATER_THAN:
            return `(${dimensionSql}) > ${castValue(
                literalFormatter(filter.values?.[0]),
            )}`;
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return `(${dimensionSql}) >= ${castValue(
                literalFormatter(filter.values?.[0]),
            )}`;
        case FilterOperator.LESS_THAN:
            return `(${dimensionSql}) < ${castValue(
                literalFormatter(filter.values?.[0]),
            )}`;
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return `(${dimensionSql}) <= ${castValue(
                literalFormatter(filter.values?.[0]),
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
                const completedDate = getMomentDateWithCustomStartOfWeek(
                    effectiveStartOfWeek,
                )
                    .tz(timezone)
                    .startOf(unitOfTime)
                    .utc()
                    .toDate();
                const untilDate = boundaryFormatter(
                    getMomentDateWithCustomStartOfWeek(effectiveStartOfWeek)
                        .tz(timezone)
                        .startOf(unitOfTime)
                        .utc()
                        .toDate(),
                );
                return `${not}((${dimensionSql}) >= ${castValue(
                    boundaryFormatter(
                        getMomentDateWithCustomStartOfWeek(
                            effectiveStartOfWeek,
                            completedDate,
                        )
                            .tz(timezone)
                            .subtract(filter.values?.[0], unitOfTime)
                            .utc()
                            .toDate(),
                    ),
                )} AND (${dimensionSql}) < ${castValue(untilDate)})`;
            }
            const untilDate = boundaryFormatter(
                getMomentDateWithCustomStartOfWeek(effectiveStartOfWeek)
                    .tz(timezone)
                    .utc()
                    .toDate(),
            );
            return `${not}((${dimensionSql}) >= ${castValue(
                boundaryFormatter(
                    getMomentDateWithCustomStartOfWeek(effectiveStartOfWeek)
                        .tz(timezone)
                        .subtract(filter.values?.[0], unitOfTime)
                        .utc()
                        .toDate(),
                ),
            )} AND (${dimensionSql}) <= ${castValue(untilDate)})`;
        }
        case FilterOperator.IN_THE_NEXT: {
            const unitOfTime: UnitOfTime =
                filter.settings?.unitOfTime || UnitOfTime.days;
            const completed: boolean = !!filter.settings?.completed;

            if (completed) {
                const fromDate = getMomentDateWithCustomStartOfWeek(
                    effectiveStartOfWeek,
                )
                    .tz(timezone)
                    .add(1, unitOfTime)
                    .startOf(unitOfTime)
                    .utc()
                    .toDate();
                const toDate = boundaryFormatter(
                    getMomentDateWithCustomStartOfWeek(
                        effectiveStartOfWeek,
                        fromDate,
                    )
                        .tz(timezone)
                        .add(filter.values?.[0], unitOfTime)
                        .utc()
                        .toDate(),
                );
                return `((${dimensionSql}) >= ${castValue(
                    boundaryFormatter(fromDate),
                )} AND (${dimensionSql}) < ${castValue(toDate)})`;
            }
            const fromDate = boundaryFormatter(
                getMomentDateWithCustomStartOfWeek(effectiveStartOfWeek)
                    .tz(timezone)
                    .utc()
                    .toDate(),
            );
            const toDate = boundaryFormatter(
                getMomentDateWithCustomStartOfWeek(effectiveStartOfWeek)
                    .tz(timezone)
                    .add(filter.values?.[0], unitOfTime)
                    .utc()
                    .toDate(),
            );
            return `((${dimensionSql}) >= ${castValue(
                fromDate,
            )} AND (${dimensionSql}) <= ${castValue(toDate)})`;
        }
        case FilterOperator.IN_THE_CURRENT: {
            const unitOfTime: UnitOfTime =
                filter.settings?.unitOfTime || UnitOfTime.days;

            const fromDate = boundaryFormatter(
                getMomentDateWithCustomStartOfWeek(effectiveStartOfWeek)
                    .tz(timezone)
                    .startOf(unitOfTime)
                    .utc()
                    .toDate(),
            );
            const untilDate = boundaryFormatter(
                getMomentDateWithCustomStartOfWeek(effectiveStartOfWeek)
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

            const fromDate = boundaryFormatter(
                getMomentDateWithCustomStartOfWeek(effectiveStartOfWeek)
                    .tz(timezone)
                    .startOf(unitOfTime)
                    .utc()
                    .toDate(),
            );
            const untilDate = boundaryFormatter(
                getMomentDateWithCustomStartOfWeek(effectiveStartOfWeek)
                    .tz(timezone)
                    .endOf(unitOfTime)
                    .utc()
                    .toDate(),
            );

            const castedFromDate = castValue(fromDate);
            const castedUntilDate = castValue(untilDate);

            return `(NOT ((${dimensionSql}) >= ${castedFromDate} AND (${dimensionSql}) <= ${castedUntilDate}))`;
        }
        case FilterOperator.IN_PERIOD_TO_DATE: {
            const today =
                getMomentDateWithCustomStartOfWeek(effectiveStartOfWeek).tz(
                    timezone,
                );
            const periodUnit = (filter as DateFilterRule).settings?.unitOfTime;
            // Use the raw base dimension SQL for date extraction when available
            // (e.g., when filtering on a DATE_TRUNC'd dimension like order_date_year)
            const extractSql = baseDimensionSql || dimensionSql;
            switch (periodUnit) {
                case UnitOfTime.years: {
                    const dayOfYear = today.dayOfYear(); // 1-366
                    switch (adapterType) {
                        case SupportedDbtAdapter.BIGQUERY:
                            return `(EXTRACT(DAYOFYEAR FROM ${extractSql}) <= ${dayOfYear})`;
                        case SupportedDbtAdapter.CLICKHOUSE:
                            return `(toDayOfYear(${extractSql}) <= ${dayOfYear})`;
                        default:
                            return `(EXTRACT(DOY FROM ${extractSql}) <= ${dayOfYear})`;
                    }
                }
                case UnitOfTime.months: {
                    const dayOfMonth = today.date(); // 1-31
                    switch (adapterType) {
                        case SupportedDbtAdapter.CLICKHOUSE:
                            return `(toDayOfMonth(${extractSql}) <= ${dayOfMonth})`;
                        default:
                            return `(EXTRACT(DAY FROM ${extractSql}) <= ${dayOfMonth})`;
                    }
                }
                case UnitOfTime.quarters: {
                    const quarterStart = today.clone().startOf('quarter');
                    const dayInQuarter = today.diff(quarterStart, 'days');
                    switch (adapterType) {
                        case SupportedDbtAdapter.BIGQUERY:
                            return `(DATE_DIFF(${extractSql}, DATE_TRUNC(${extractSql}, QUARTER), DAY) <= ${dayInQuarter})`;
                        case SupportedDbtAdapter.CLICKHOUSE:
                            return `(dateDiff('day', toStartOfQuarter(${extractSql}), ${extractSql}) <= ${dayInQuarter})`;
                        case SupportedDbtAdapter.TRINO:
                        case SupportedDbtAdapter.ATHENA:
                            return `(DATE_DIFF('day', DATE_TRUNC('quarter', ${extractSql}), ${extractSql}) <= ${dayInQuarter})`;
                        default:
                            return `(EXTRACT(DAY FROM ${extractSql} - DATE_TRUNC('QUARTER', ${extractSql})) <= ${dayInQuarter})`;
                    }
                }
                case UnitOfTime.weeks: {
                    const weekStart = today.clone().startOf('week');
                    const dayInWeek = today.diff(weekStart, 'days');
                    switch (adapterType) {
                        case SupportedDbtAdapter.BIGQUERY:
                            return `(DATE_DIFF(${extractSql}, DATE_TRUNC(${extractSql}, WEEK(${effectiveStartOfWeek === WeekDay.SUNDAY ? 'SUNDAY' : 'MONDAY'})), DAY) <= ${dayInWeek})`;
                        case SupportedDbtAdapter.CLICKHOUSE:
                            return `(dateDiff('day', toStartOfWeek(${extractSql}, ${effectiveStartOfWeek === WeekDay.SUNDAY ? '0' : '1'}), ${extractSql}) <= ${dayInWeek})`;
                        case SupportedDbtAdapter.TRINO:
                        case SupportedDbtAdapter.ATHENA:
                            return `(DATE_DIFF('day', DATE_TRUNC('week', ${extractSql}), ${extractSql}) <= ${dayInWeek})`;
                        default:
                            return `(EXTRACT(DAY FROM ${extractSql} - DATE_TRUNC('WEEK', ${extractSql})) <= ${dayInWeek})`;
                    }
                }
                default:
                    throw new CompileError(
                        `Period to date filter requires a unitOfTime setting (weeks, months, quarters, or years)`,
                    );
            }
        }
        case FilterOperator.IN_BETWEEN: {
            const startDate = literalFormatter(filter.values?.[0]);
            const endDate = literalFormatter(filter.values?.[1]);

            return `((${dimensionSql}) >= ${castValue(
                startDate,
            )} AND (${dimensionSql}) <= ${castValue(endDate)})`;
        }
        default:
            return raiseInvalidFilterError('date', filter);
    }
};

/**
 * Renders filter SQL for DATE-type dimensions.
 *
 * When no explicit boundaryDateFormatter is provided, both boundary
 * computation and formatting default to UTC.  This matches the warehouse's
 * UTC-based DATE_TRUNC and removes any dependency on the server's local
 * timezone.  Callers that enable timezone-aware DATE_TRUNC should pass
 * createBoundaryDateFormatter(timezone) so both sides use the project
 * timezone instead.
 */
export const renderDateFilterSql = (
    dimensionSql: string,
    filter: DateFilterRule,
    adapterType: SupportedDbtAdapter,
    timezone: string,
    boundaryDateFormatter?: (date: Date) => string,
    startOfWeek: WeekDay | null | undefined = undefined,
    baseDimensionSql?: string,
    useTimezoneAwareDateTrunc?: boolean,
): string => {
    const effectiveTimezone = boundaryDateFormatter ? timezone : 'UTC';
    const effectiveFormatter =
        boundaryDateFormatter ?? createBoundaryDateFormatter('UTC');

    return renderDateOrTimestampFilterSql(
        dimensionSql,
        filter,
        adapterType,
        effectiveTimezone,
        formatDate,
        effectiveFormatter,
        startOfWeek,
        baseDimensionSql,
        useTimezoneAwareDateTrunc,
    );
};

/** Renders filter SQL for TIMESTAMP-type dimensions. Both literals and boundaries use the same UTC formatter. */
export const renderTimestampFilterSql = (
    dimensionSql: string,
    filter: DateFilterRule,
    adapterType: SupportedDbtAdapter,
    timezone: string,
    timestampFormatter: (date: Date) => string,
    startOfWeek: WeekDay | null | undefined = undefined,
    baseDimensionSql?: string,
    useTimezoneAwareDateTrunc?: boolean,
): string =>
    renderDateOrTimestampFilterSql(
        dimensionSql,
        filter,
        adapterType,
        timezone,
        timestampFormatter,
        timestampFormatter,
        startOfWeek,
        baseDimensionSql,
        useTimezoneAwareDateTrunc,
    );

export const renderBooleanFilterSql = (
    dimensionSql: string,
    filter: FilterRule<FilterOperator, unknown>,
): string => {
    switch (filter.operator) {
        case 'equals':
            return `(${dimensionSql}) = ${convertToBooleanValue(
                filter.values?.[0],
            )}`;
        case 'notEquals':
            return `((${dimensionSql}) != ${convertToBooleanValue(
                filter.values?.[0],
            )} OR (${dimensionSql}) IS NULL)`;
        case 'isNull':
            return `(${dimensionSql}) IS NULL`;
        case 'notNull':
            return `(${dimensionSql}) IS NOT NULL`;
        default:
            return raiseInvalidFilterError('boolean', filter);
    }
};

const escapeStringValuesOnFilterRule = (
    filterRule: FilterRule<FilterOperator, unknown>,
    escapeString: (string: string) => string,
): FilterRule<FilterOperator, unknown> => ({
    ...filterRule,
    values: filterRule.values?.map((v) =>
        typeof v === 'string'
            ? escapeString(v) // escape the string quote char
            : v,
    ),
});

export const renderTableCalculationFilterRuleSql = (
    filterRule: FilterRule<FilterOperator, unknown>,
    field: TableCalculation | undefined,
    fieldQuoteChar: string,
    stringQuoteChar: string,
    escapeString: (string: string) => string,
    adapterType: SupportedDbtAdapter,
    startOfWeek: WeekDay | null | undefined,
    timezone: string = 'UTC',
): string => {
    if (!field) return '1=1';

    const fieldSql = `${fieldQuoteChar}${getItemId(field)}${fieldQuoteChar}`;

    const escapedFilterRule = escapeStringValuesOnFilterRule(
        filterRule,
        escapeString,
    );

    // First we default to field.type
    // otherwise, we check the custom format for backwards compatibility
    switch (field.type) {
        case TableCalculationType.STRING:
            return renderStringFilterSql(
                fieldSql,
                escapedFilterRule,
                stringQuoteChar,
                true, // Table calculations default to case sensitive
            );
        case TableCalculationType.DATE:
        case TableCalculationType.TIMESTAMP:
            return renderDateFilterSql(
                fieldSql,
                escapedFilterRule,
                adapterType,
                timezone,
                undefined,
                startOfWeek,
            );
        case TableCalculationType.NUMBER:
            return renderNumberFilterSql(fieldSql, escapedFilterRule);
        case TableCalculationType.BOOLEAN:
            return renderBooleanFilterSql(fieldSql, escapedFilterRule);
        default:
        // Do nothing here. This will try with format.type for backwards compatibility
    }

    switch (field.format?.type) {
        case CustomFormatType.PERCENT:
        case CustomFormatType.CURRENCY:
        case CustomFormatType.NUMBER: {
            return renderNumberFilterSql(fieldSql, escapedFilterRule);
        }
        default:
            return renderStringFilterSql(
                fieldSql,
                escapedFilterRule,
                stringQuoteChar,
                true, // Table calculations default to case sensitive
            );
    }
};

export const renderFilterRuleSql = (
    filterRule: FilterRule<FilterOperator, unknown>,
    fieldType: DimensionType | MetricType,
    fieldSql: string,
    stringQuoteChar: string,
    escapeString: (string: string) => string,
    startOfWeek: WeekDay | null | undefined,
    adapterType: SupportedDbtAdapter,
    timezone: string = 'UTC',
    caseSensitive: boolean = true,
    baseDimensionSql?: string,
    useTimezoneAwareDateTrunc?: boolean,
    baseTimeIntervalDimensionType?: DimensionType,
): string => {
    if (filterRule.disabled) {
        return `1=1`; // When filter is disabled, we want to return all rows
    }
    const escapedFilterRule = escapeStringValuesOnFilterRule(
        filterRule,
        escapeString,
    );

    switch (fieldType) {
        case DimensionType.STRING:
        case MetricType.STRING: {
            return renderStringFilterSql(
                fieldSql,
                escapedFilterRule,
                stringQuoteChar,
                caseSensitive,
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
        case MetricType.SUM_DISTINCT:
        case MetricType.AVERAGE_DISTINCT:
        case MetricType.MIN:
        case MetricType.MAX:
        case MetricType.PERCENT_OF_PREVIOUS:
        case MetricType.PERCENT_OF_TOTAL:
        case MetricType.RUNNING_TOTAL: {
            return renderNumberFilterSql(fieldSql, escapedFilterRule);
        }
        case DimensionType.DATE:
        case MetricType.DATE: {
            // Only truncations over a TIMESTAMP base carry a timestamptz
            // SQL expression; pure DATE columns stay bare DATE, so wrapping
            // the literal would break BigQuery's DATE vs TIMESTAMP check.
            const wrapLiteralAsTimestamptz =
                !!useTimezoneAwareDateTrunc &&
                baseTimeIntervalDimensionType === DimensionType.TIMESTAMP;
            return renderDateFilterSql(
                fieldSql,
                escapedFilterRule,
                adapterType,
                timezone,
                useTimezoneAwareDateTrunc
                    ? createBoundaryDateFormatter(timezone)
                    : undefined,
                startOfWeek,
                baseDimensionSql,
                wrapLiteralAsTimestamptz,
            );
        }
        case DimensionType.TIMESTAMP:
        case MetricType.TIMESTAMP: {
            return renderTimestampFilterSql(
                fieldSql,
                escapedFilterRule,
                adapterType,
                timezone,
                adapterType === SupportedDbtAdapter.CLICKHOUSE ||
                    adapterType === SupportedDbtAdapter.BIGQUERY
                    ? formatTimestampAsUTCNoOffset
                    : formatTimestampAsUTC,
                startOfWeek,
                baseDimensionSql,
            );
        }
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN: {
            return renderBooleanFilterSql(fieldSql, escapedFilterRule);
        }
        default: {
            return assertUnreachable(
                fieldType,
                `No function implemented to render sql for filter group type ${fieldType}`,
            );
        }
    }
};

// To be used for filters with a field that is a dimension or metric
export const renderFilterRuleSqlFromField = (
    filterRule: FilterRule<FilterOperator, unknown>,
    field: CompiledField | CompiledCustomSqlDimension,
    fieldQuoteChar: string,
    stringQuoteChar: string,
    escapeString: (string: string) => string,
    startOfWeek: WeekDay | null | undefined,
    adapterType: SupportedDbtAdapter,
    timezone: string = 'UTC',
    exploreCaseSensitive: boolean = true,
    baseDimensionSql?: string,
    useTimezoneAwareDateTrunc?: boolean,
): string => {
    const fieldType = isCompiledCustomSqlDimension(field)
        ? field.dimensionType
        : field.type;
    const fieldSql = isMetric(field)
        ? `${fieldQuoteChar}${getItemId(field)}${fieldQuoteChar}`
        : field.compiledSql;

    // Determine if this filter should be case sensitive
    // Priority: filter-rule-level override > field-level setting > explore-level setting > default true
    let caseSensitive: boolean;
    if (filterRule.caseSensitive !== undefined) {
        caseSensitive = filterRule.caseSensitive;
    } else if (isMetric(field)) {
        caseSensitive = true;
    } else if ('caseSensitive' in field && field.caseSensitive !== undefined) {
        caseSensitive = field.caseSensitive;
    } else {
        caseSensitive = exploreCaseSensitive;
    }

    const baseTimeIntervalDimensionType =
        !isCompiledCustomSqlDimension(field) && !isMetric(field)
            ? field.timeIntervalBaseDimensionType
            : undefined;

    return renderFilterRuleSql(
        filterRule,
        fieldType,
        fieldSql,
        stringQuoteChar,
        escapeString,
        startOfWeek,
        adapterType,
        timezone,
        caseSensitive,
        baseDimensionSql,
        useTimezoneAwareDateTrunc,
        baseTimeIntervalDimensionType,
    );
};
