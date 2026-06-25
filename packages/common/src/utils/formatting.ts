import dayjs from 'dayjs';
import dayjsTimezone from 'dayjs/plugin/timezone';
import moment, { type MomentInput } from 'moment-timezone';
import {
    addLocale,
    format as formatWithExpression,
    isDateFormat,
    isTextFormat,
    isValidFormat,
} from 'numfmt';
import { LightdashParameters } from '../compiler/parameters';
import {
    CompactConfigMap,
    CustomFormatType,
    DimensionType,
    findCompactConfig,
    Format,
    IECByteCompacts,
    isCustomSqlDimension,
    isDimension,
    isField,
    isFormat,
    isMetric,
    isTableCalculation,
    MetricType,
    NumberSeparator,
    TableCalculationType,
    type CompactOrAlias,
    type CustomDimension,
    type CustomFormat,
    type Dimension,
    type Field,
    type Item,
    type TableCalculation,
} from '../types/field';
import {
    hasFormatOptions,
    isAdditionalMetric,
    type AdditionalMetric,
} from '../types/metricQuery';
import { TimeFrames } from '../types/timeFrames';
import assertUnreachable from './assertUnreachable';
import { evaluateConditionalFormatExpression } from './conditionalFormatExpressions';
import { getItemType, isNumericItem } from './item';

dayjs.extend(dayjsTimezone);

export const currencies = [
    'USD',
    'EUR',
    'GBP',
    'JPY',
    'DKK',
    'CHF',
    'CAD',
    'AUD',
    'CNY',
    'ARS',
    'BRL',
    'CLP',
    'COP',
    'CZK',
    'HKD',
    'HUF',
    'INR',
    'ILS',
    'KRW',
    'MYR',
    'MXN',
    'MAD',
    'NZD',
    'NOK',
    'PHP',
    'PLN',
    'RUB',
    'SAR',
    'SGD',
    'ZAR',
    'SEK',
    'TWD',
    'THB',
    'TRY',
    'VND',
];

export const formatBoolean = <T>(v: T) =>
    ['True', 'true', 'yes', 'Yes', '1', 'T'].includes(`${v}`)
        ? 'True'
        : 'False';

export const getDateFormat = (
    timeInterval: TimeFrames | undefined = TimeFrames.DAY,
): string => {
    switch (timeInterval) {
        case TimeFrames.YEAR:
            return 'YYYY';
        case TimeFrames.QUARTER:
            return 'YYYY-[Q]Q';
        case TimeFrames.MONTH:
            return 'YYYY-MM';
        default:
            return 'YYYY-MM-DD';
    }
};

const getTimeFormat = (
    timeInterval: TimeFrames | undefined = TimeFrames.DAY,
): string => {
    let timeFormat: string;
    switch (timeInterval) {
        case TimeFrames.HOUR:
            timeFormat = 'HH';
            break;
        case TimeFrames.MINUTE:
            timeFormat = 'HH:mm';
            break;
        case TimeFrames.SECOND:
            timeFormat = 'HH:mm:ss';
            break;
        default:
            timeFormat = 'HH:mm:ss:SSS';
            break;
    }
    return `YYYY-MM-DD, ${timeFormat} (Z)`;
};

// TODO: To rename to isDayJsInput once we remove moment usage
export const isMomentInput = (value: unknown): value is MomentInput =>
    typeof value === 'string' ||
    typeof value === 'number' ||
    value instanceof Date ||
    value instanceof moment ||
    value instanceof dayjs;

// A string carrying both a date and a time component (e.g. "2024-01-02T03:04…"
// or "2024-01-02 03:04…") — as opposed to a bare date, a number, or text.
// Unlike a parse-validity check, this requires a time part, so date-only values
// are excluded (they must not be timezone-shifted).
export const isTimestampString = (value: unknown): value is string =>
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value);

export function formatDate(
    date: MomentInput,
    timeInterval: TimeFrames = TimeFrames.DAY,
    convertToUTC: boolean = false,
    timezone?: string,
): string {
    let momentDate;
    if (timezone) {
        momentDate = moment.utc(date).tz(timezone);
    } else if (convertToUTC) {
        momentDate = moment.utc(date);
    } else {
        momentDate = moment(date);
    }

    if (!momentDate.isValid()) {
        return 'NaT';
    }

    return momentDate.format(getDateFormat(timeInterval));
}

// Pass `timezone` to convert the UTC value into that zone. Pass `displayTimezone`
// when the value is already wall-clock in that zone — it only appends the offset
// suffix. Pass at most one.
export function formatTimestamp(
    value: MomentInput,
    timeInterval: TimeFrames | undefined = TimeFrames.MILLISECOND,
    convertToUTC: boolean = false,
    timezone?: string,
    displayTimezone?: string,
): string {
    let momentDate;
    if (timezone) {
        momentDate = moment.utc(value).tz(timezone);
    } else if (convertToUTC) {
        momentDate = moment.utc(value);
    } else {
        momentDate = moment(value);
    }

    if (!momentDate.isValid()) {
        return 'NaT';
    }

    if (!timezone && displayTimezone) {
        const offsetMinutes = moment.tz(value, displayTimezone).utcOffset();
        return momentDate
            .utcOffset(offsetMinutes, true)
            .format(getTimeFormat(timeInterval));
    }

    return momentDate.format(getTimeFormat(timeInterval));
}

// Date whose UTC components match `value` rendered in `timezone`.
// ExcelJS serializes Date cells via UTC components and Excel cells
// carry no zone — this is how we land project-tz wall-clock in a
// real date cell. Resulting Date no longer represents a real instant.
export function toExcelWallClockDate(
    value: MomentInput,
    timezone: string,
): Date {
    return moment.tz(value, timezone).utc(true).toDate();
}

// Re-encode a UTC instant as ISO 8601 in the project tz with an explicit
// offset suffix (e.g. `2024-01-14T15:00:00.000-11:00`). Returns undefined
// when there's nothing to shift; callers fall through to passthrough so
// flag-off / UTC output stays bit-identical.
export const toIsoWithProjectOffset = (
    rawValue: unknown,
    timezone: string | undefined,
): string | undefined => {
    if (!timezone || timezone === 'UTC') return undefined;
    if (
        typeof rawValue !== 'string' &&
        typeof rawValue !== 'number' &&
        !(rawValue instanceof Date)
    ) {
        return undefined;
    }
    const m = moment.utc(rawValue);
    if (!m.isValid()) return undefined;
    return m.tz(timezone).toISOString(true);
};

// Use this when deciding whether to re-shift a fetched VALUE in the client
// (chart rendering, spreadsheet exports). Only TIMESTAMP instants shift; calendar
// DATEs (incl. day-or-coarser truncs, which now compile to a real DATE —
// GLITCH-452) and `skipTimezoneConversion` dims stay put. Keyed off getItemType
// (resolved type) so it also classifies non-field items (table calcs, custom dims).
// NOT for "is this field timezone-sensitive" UI — use isItemTimezoneAffected.
export const shouldShiftItemTimezone = (
    item: Item | AdditionalMetric | undefined,
): boolean => {
    if (!item) return false;
    if (isDimension(item) && item.skipTimezoneConversion) return false;
    return getItemType(item) === DimensionType.TIMESTAMP;
};

// Use this for "is this field timezone-sensitive" UI affordances (icons,
// tooltips). Whether a field's value depends on the chart's timezone at all —
// server-side or client-side. Differs from shouldShiftItemTimezone ("does the
// client re-shift the value"): a day-or-coarser trunc of a TIMESTAMP base
// compiles to a real DATE, so it isn't re-shifted client-side, yet the backend
// shifts to project tz before truncating — so it IS timezone-affected. Keyed
// off the base column type, mirroring MetricQueryBuilder.
export const isItemTimezoneAffected = (
    item: Item | AdditionalMetric | undefined,
): boolean => {
    if (!item) return false;
    if (isDimension(item) && item.skipTimezoneConversion) return false;
    const baseType =
        isDimension(item) && item.timeIntervalBaseDimensionType
            ? item.timeIntervalBaseDimensionType
            : getItemType(item);
    return baseType === DimensionType.TIMESTAMP;
};

// A calendar value is a bare wall-clock date (year/month/day, no instant) that
// must never be timezone-shifted. GLITCH-452: every DATE-typed item is now a
// calendar value — plain DATE columns, DATE-base truncs, DATE metrics, and
// day-or-coarser truncs of a TIMESTAMP base (which now compile to a real DATE).
// Only TIMESTAMP-typed items are instants. Keyed off getItemType so it also
// covers DATE metrics and table calcs.
export const isCalendarValueItem = (
    item: Item | AdditionalMetric | undefined,
): boolean => {
    if (!item) return false;
    return getItemType(item) === DimensionType.DATE;
};

// A Date or a datetime string (not a date-only string).
export const isTemporalValue = (value: unknown): boolean =>
    value instanceof Date || isTimestampString(value);

// Which timezone a formatter applies to a value. The shape predicate decides
// every type-known item (dims, metrics, table calcs, custom dims). MIN/MAX are
// the one opaque case — their aggregation type hides the temporal base. When the
// base is known we branch on it: a DATE base never shifts, a TIMESTAMP base
// shifts. An unknown base (arbitrary-SQL metric) falls back to the value shape.
export const getFormatterTimezone = (
    item: Item | AdditionalMetric | undefined,
    value: unknown,
    timezone: string | undefined,
): string | undefined => {
    if (!timezone) return undefined;
    if (isDimension(item) && item.skipTimezoneConversion) return undefined;
    if (isCalendarValueItem(item)) return undefined;
    if (shouldShiftItemTimezone(item)) return timezone;
    const type = item ? getItemType(item) : undefined;
    if (type === MetricType.MIN || type === MetricType.MAX) {
        const baseType = isMetric(item) ? item.baseDimensionType : undefined;
        if (baseType === DimensionType.DATE) return undefined;
        if (baseType === DimensionType.TIMESTAMP) return timezone;
        if (isTemporalValue(value)) return timezone;
    }
    return undefined;
};

// Renders a temporal cell as the wall-clock string Excel and Google Sheets
// auto-detect as a date. TIMESTAMP → `YYYY-MM-DD HH:mm:ss.SSS`, DATE →
// `YYYY-MM-DD`. Shifts into the project tz when the item is timezone-
// shiftable (TIMESTAMP only — GLITCH-452 makes day-grain DATEs calendar values)
// and a timezone is supplied; calendar DATEs are formatted as-is. Returns undefined for non-temporal fields or
// unparseable values so callers can fall through to their existing
// formatting path.
export const formatTemporalCellForSpreadsheet = (
    item: Item | undefined,
    rawValue: unknown,
    timezone: string | undefined,
): string | undefined => {
    if (!isField(item)) return undefined;
    const isTimestamp = item.type === DimensionType.TIMESTAMP;
    const isDate = item.type === DimensionType.DATE;
    if (!isTimestamp && !isDate) return undefined;
    if (rawValue === null || rawValue === undefined || rawValue === '') {
        return undefined;
    }
    const shouldShift = !!timezone && shouldShiftItemTimezone(item);
    const m = shouldShift
        ? moment.utc(rawValue as MomentInput).tz(timezone!)
        : moment(rawValue as MomentInput);
    if (!m.isValid()) return undefined;
    return m.format(isTimestamp ? 'YYYY-MM-DD HH:mm:ss.SSS' : 'YYYY-MM-DD');
};

export function getLocalTimeDisplay(
    value: MomentInput,
    showTimezone: boolean = true,
): string {
    // NOTE: Mixing dayjs and moment here is not great, but we're doing it here
    // because we are using moment types in this file and the
    // plumbing expects them. It should be ok here because we are not moment and dayjs
    // together to operate on the date. Dayjs is only used for the
    // Timezone string, which moment doesn't support.
    const tzString = showTimezone ? `(${dayjs.tz.guess()})` : '';
    return `${moment(value).format(`YYYY-MM-DD HH:mm`)} ${tzString}`;
}

export const formatDateWithPattern = (
    value: string | number,
    pattern: string,
): string => {
    const m = moment(value).utc();
    if (!m.isValid()) return String(value);
    return m.format(pattern);
};

export const parseDate = (
    str: string,
    timeInterval: TimeFrames | undefined = TimeFrames.DAY,
): Date => moment(str, getDateFormat(timeInterval)).toDate();

export const parseTimestamp = (
    str: string,
    timeInterval: TimeFrames | undefined = TimeFrames.MILLISECOND,
): Date => moment(str, getTimeFormat(timeInterval)).toDate();

function getFormatNumberOptions(value: number, format?: CustomFormat) {
    const hasCurrency =
        format?.type === CustomFormatType.CURRENCY && format?.currency;
    const currencyOptions: Intl.NumberFormatOptions = hasCurrency
        ? { style: 'currency', currency: format.currency }
        : {};

    const round = format?.round;

    if (round === undefined) {
        // When round is not defined, keep up to 3 decimal places
        return hasCurrency ? currencyOptions : {};
    }

    if (round < 0) {
        return {
            maximumSignificantDigits: Math.max(
                Math.floor(value).toString().length + round,
                1,
            ),
            maximumFractionDigits: 0,
            ...currencyOptions,
        };
    }

    const fractionDigits = Math.min(round, 20);
    return {
        maximumFractionDigits: fractionDigits,
        minimumFractionDigits: fractionDigits,
        ...currencyOptions,
    };
}

export function valueIsNaN(value: unknown) {
    if (typeof value === 'boolean') return true;

    return Number.isNaN(Number(value));
}

export function isNumber(value: unknown): value is number {
    return !valueIsNaN(value);
}

// Separator styles whose grouping/decimal characters have no exact built-in
// numfmt locale are registered here once, at module load. The characters mirror
// the `toLocaleString`-based CustomFormat path so an ECMA-376 expression and a
// structured format render the same separators. The registry is immutable after
// this — the separator is selected per-call via numfmt's `locale` option, which
// is safe for concurrent multi-tenant formatting on the server.
// Tags must be valid BCP-47 (numfmt rejects 3+ hyphenated parts as malformed
// and silently falls back to its default locale), so use short 2-segment tags.
const NUMFMT_LOCALE_PERIOD_COMMA = 'ld-pc'; // 1.234.567,50
const NUMFMT_LOCALE_SPACE_PERIOD = 'ld-sp'; // 1 234 567.50
const NUMFMT_LOCALE_NO_SEPARATOR = 'ld-ns'; // 1234567.50
const NUMFMT_LOCALE_APOSTROPHE_PERIOD = 'ld-ap'; // 1'234'567.50
addLocale({ group: '.', decimal: ',' }, NUMFMT_LOCALE_PERIOD_COMMA);
addLocale({ group: ' ', decimal: '.' }, NUMFMT_LOCALE_SPACE_PERIOD);
addLocale({ group: '', decimal: '.' }, NUMFMT_LOCALE_NO_SEPARATOR);
addLocale({ group: "'", decimal: '.' }, NUMFMT_LOCALE_APOSTROPHE_PERIOD);

// The numfmt locale used to render an ECMA-376 expression for a given separator.
// DEFAULT and COMMA_PERIOD return undefined so numfmt keeps its built-in
// comma-period output, leaving existing format strings byte-identical.
function separatorToNumfmtLocale(
    separator: NumberSeparator | undefined,
): string | undefined {
    switch (separator) {
        case NumberSeparator.PERIOD_COMMA:
            return NUMFMT_LOCALE_PERIOD_COMMA;
        case NumberSeparator.SPACE_PERIOD:
            return NUMFMT_LOCALE_SPACE_PERIOD;
        case NumberSeparator.NO_SEPARATOR_PERIOD:
            return NUMFMT_LOCALE_NO_SEPARATOR;
        case NumberSeparator.APOSTROPHE_PERIOD:
            return NUMFMT_LOCALE_APOSTROPHE_PERIOD;
        case NumberSeparator.COMMA_PERIOD:
        case NumberSeparator.DEFAULT:
        case undefined:
            return undefined;
        default:
            return assertUnreachable(
                separator,
                `Unknown number separator ${separator}`,
            );
    }
}

export function formatNumberValue(
    value: number,
    format?: CustomFormat,
): string {
    const options = getFormatNumberOptions(value, format);
    const separator = format?.separator || NumberSeparator.DEFAULT;
    switch (separator) {
        case NumberSeparator.COMMA_PERIOD:
            return value.toLocaleString('en-US', options);
        case NumberSeparator.SPACE_PERIOD:
            return value.toLocaleString('en-US', options).replace(/,/g, ' ');
        case NumberSeparator.PERIOD_COMMA:
            // If currency is provided, having a PERIOD_COMMA separator will also change the position of the currency symbol
            return value.toLocaleString('de-DE', options);
        case NumberSeparator.NO_SEPARATOR_PERIOD:
            return value.toLocaleString('en-US', {
                ...options,
                useGrouping: false,
            });
        case NumberSeparator.APOSTROPHE_PERIOD:
            return value.toLocaleString('en-US', options).replace(/,/g, "'");
        case NumberSeparator.DEFAULT:
            // This will apply the default style for each currency
            return value.toLocaleString(undefined, options);
        default:
            return assertUnreachable(separator, 'Unknown separator');
    }
}

export function applyDefaultFormat(value: unknown) {
    if (value === null) return '∅';
    if (value === undefined) return '-';
    if (!isNumber(value)) {
        return `${value}`;
    }

    return formatNumberValue(value);
}

export function getCustomFormatFromLegacy({
    format,
    compact,
    round,
}: {
    format?: Format | string;
    compact?: CompactOrAlias;
    round?: number;
}): CustomFormat {
    switch (format) {
        case Format.EUR:
        case Format.GBP:
        case Format.USD:
        case Format.JPY:
        case Format.DKK:
            return {
                type: CustomFormatType.CURRENCY,
                currency: format.toUpperCase(),
                compact,
                round,
            };
        case Format.KM:
        case Format.MI:
            return {
                type: CustomFormatType.NUMBER,
                suffix: ` ${format}`,
                compact,
                round,
            };
        case Format.PERCENT:
            return {
                type: CustomFormatType.PERCENT,
                compact,
                round,
            };
        case Format.ID:
            return {
                type: CustomFormatType.ID,
            };
        default:
            return {
                type: CustomFormatType.NUMBER,
                round,
                compact,
            };
    }
}

export function hasFormatting(
    item:
        | Field
        | AdditionalMetric
        | TableCalculation
        | CustomDimension
        | undefined,
): boolean {
    if (!item) return false;
    if (hasFormatOptions(item)) {
        return true;
    }
    if (isTableCalculation(item)) {
        return item.format !== undefined;
    }
    if (isDimension(item) || isMetric(item)) {
        return (
            item.format !== undefined ||
            item.compact !== undefined ||
            item.round !== undefined
        );
    }
    return false;
}

// The effective number separator for an item, in priority order: an explicit
// formatOptions separator, a table calculation's format separator, then the
// field-level `separator` (the dbt YAML property). Used by both the structured
// and ECMA-376 rendering paths so they agree.
export function getEffectiveSeparator(
    item:
        | Field
        | AdditionalMetric
        | TableCalculation
        | CustomDimension
        | undefined,
): NumberSeparator | undefined {
    if (!item) return undefined;
    if (hasFormatOptions(item) && item.formatOptions.separator) {
        return item.formatOptions.separator;
    }
    if (isTableCalculation(item) && item.format?.separator) {
        return item.format.separator;
    }
    if ('separator' in item && item.separator) {
        return item.separator;
    }
    return undefined;
}

// The numfmt locale string used to render an ECMA-376 format expression for an
// item, derived from its effective separator. Exported so render paths that call
// formatValueWithExpression directly (e.g. chart series formatters) localise
// expressions the same way formatItemValue does. Returns undefined for the
// default/US separator so output stays byte-identical.
export function getFormatExpressionLocale(
    item:
        | Field
        | AdditionalMetric
        | TableCalculation
        | CustomDimension
        | undefined,
): string | undefined {
    return separatorToNumfmtLocale(getEffectiveSeparator(item));
}

export function getCustomFormat(
    item:
        | Field
        | AdditionalMetric
        | TableCalculation
        | CustomDimension
        | undefined,
): CustomFormat | undefined {
    if (!item) return undefined;

    let base: CustomFormat | undefined;
    if (hasFormatOptions(item)) {
        base = item.formatOptions;
    } else if (isTableCalculation(item)) {
        base = item.format;
    } else {
        const legacyFormat = {
            ...('format' in item && { format: item.format }),
            ...('compact' in item && { compact: item.compact }),
            ...('round' in item && { round: item.round }),
        };

        // Only get custom format from legacy if there are any legacy format options or if the item is numeric
        if (Object.keys(legacyFormat).length > 0 || isNumericItem(item)) {
            base = getCustomFormatFromLegacy(legacyFormat);
        }
    }

    if (!base) return undefined;

    // Apply the field-level separator unless the format already carries one.
    // DEFAULT is a no-op, so skip the allocation for it.
    if (!base.separator) {
        const separator = getEffectiveSeparator(item);
        if (separator && separator !== NumberSeparator.DEFAULT) {
            return { ...base, separator };
        }
    }
    return base;
}

function applyCompact(
    value: unknown,
    format?: CustomFormat,
): {
    compactValue: number;
    compactSuffix: string;
} {
    if (format?.compact === undefined)
        return { compactValue: Number(value), compactSuffix: '' };

    const compactConfig = findCompactConfig(format.compact);

    if (compactConfig) {
        const compactValue = compactConfig.convertFn(Number(value));
        const compactSuffix = format.compact ? compactConfig.suffix : '';

        return { compactValue, compactSuffix };
    }

    return { compactValue: Number(value), compactSuffix: '' };
}

export function formatValueWithExpression(
    expression: string,
    value: unknown,
    locale?: string,
    timezone?: string,
) {
    try {
        let sanitizedValue = value;
        // Only number formatting is localised; dates/text keep the default
        // locale so month names etc. are unaffected.
        const localeOptions = locale ? { locale } : undefined;

        if (typeof value === 'bigint') {
            if (
                value <= Number.MAX_SAFE_INTEGER &&
                value >= Number.MIN_SAFE_INTEGER
            ) {
                sanitizedValue = Number(value);
            } else {
                throw new Error(
                    "Can't format value as BigInt is out of safe integer range",
                );
            }
        }

        // Check if this is a binary (IEC) byte unit format expression using KiB, MiB, etc.
        const binaryByteUnits = IECByteCompacts.map(
            (compact) => CompactConfigMap[compact].suffix,
        );
        const binarySuffixMatch = binaryByteUnits.find((unit) =>
            expression.includes(`"${unit}"`),
        );
        if (binarySuffixMatch && !valueIsNaN(Number(sanitizedValue))) {
            const compactConfig = Object.values(CompactConfigMap).find(
                (config) =>
                    config.suffix === binarySuffixMatch &&
                    IECByteCompacts.includes(config.compact),
            );

            if (compactConfig) {
                const convertedValue = compactConfig.convertFn(
                    Number(sanitizedValue),
                );
                const baseExpression = expression.replace(
                    `"${binarySuffixMatch}"`,
                    '',
                );
                const formattedNumber = formatWithExpression(
                    baseExpression,
                    convertedValue,
                    localeOptions,
                );
                return `${formattedNumber}${binarySuffixMatch}`;
            }
        }

        // format date
        if (isDateFormat(expression)) {
            if (!isMomentInput(sanitizedValue)) {
                return 'NaT';
            }
            // Shift into the project tz then relabel wall-clock as UTC so
            // numfmt's `ignoreTimezone` renders it verbatim. Gated like
            // formatTimestamp (`if (timezone)`).
            const dateForExpression = timezone
                ? moment.utc(sanitizedValue).tz(timezone).utc(true).toDate()
                : moment(sanitizedValue).toDate();
            return formatWithExpression(expression, dateForExpression, {
                ignoreTimezone: true,
            });
        }

        // format text
        if (isTextFormat(expression)) {
            return formatWithExpression(expression, sanitizedValue);
        }

        // format number
        return valueIsNaN(Number(sanitizedValue))
            ? `${value}` // Return the raw value as a string if it's not a number
            : formatWithExpression(
                  expression,
                  Number(sanitizedValue),
                  localeOptions,
              );
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Error formatting value with expression', e);
        return `${value}`;
    }
}

export function applyCustomFormat(
    value: unknown,
    format?: CustomFormat | undefined,
    timezone?: string,
): string {
    if (format?.type === undefined) return applyDefaultFormat(value);

    if (value === '') return '';

    // No `item` here, so gate the timezone by value; item-aware callers resolve
    // it via getFormatterTimezone first.
    const effectiveTimezone = isTemporalValue(value) ? timezone : undefined;

    if (
        value instanceof Date &&
        ![CustomFormatType.DATE, CustomFormatType.TIMESTAMP].includes(
            format.type,
        )
    ) {
        return formatTimestamp(value, undefined, false, effectiveTimezone);
    }

    // Timestamp strings are `valueIsNaN`, so the guard below would return them
    // raw. When a timezone is supplied, format them first so they render shifted.
    if (effectiveTimezone && isTimestampString(value)) {
        switch (format.type) {
            case CustomFormatType.DATE:
                return formatDate(
                    value,
                    format?.timeInterval,
                    false,
                    effectiveTimezone,
                );
            case CustomFormatType.TIMESTAMP:
                return formatTimestamp(
                    value,
                    format?.timeInterval,
                    false,
                    effectiveTimezone,
                );
            case CustomFormatType.CUSTOM:
                return formatValueWithExpression(
                    format.custom || '',
                    value,
                    separatorToNumfmtLocale(format.separator),
                    effectiveTimezone,
                );
            default:
                break;
        }
    }

    if (valueIsNaN(value) || value === null) {
        return applyDefaultFormat(value);
    }

    switch (format.type) {
        case CustomFormatType.ID:
            return `${value}`;
        case CustomFormatType.DEFAULT:
            return applyDefaultFormat(value);

        case CustomFormatType.PERCENT:
            const formatted = formatNumberValue(Number(value) * 100, format);
            return `${formatted}%`;
        case CustomFormatType.CURRENCY:
            const { compactValue, compactSuffix } = applyCompact(value, format);

            const currencyFormatted = formatNumberValue(
                compactValue,
                format,
            ).replace(/\u00A0/, ' ');

            return `${currencyFormatted}${compactSuffix}`;
        case CustomFormatType.DATE:
            return formatDate(
                value,
                format?.timeInterval,
                false,
                effectiveTimezone,
            );
        case CustomFormatType.TIMESTAMP:
            return formatTimestamp(
                value,
                format?.timeInterval,
                false,
                effectiveTimezone,
            );
        case CustomFormatType.NUMBER:
            const prefix = format.prefix || '';
            const suffix = format.suffix || '';
            const {
                compactValue: compactNumber,
                compactSuffix: compactNumberSuffix,
            } = applyCompact(value, format);

            const numberFormatted = formatNumberValue(compactNumber, format);

            return `${prefix}${numberFormatted}${compactNumberSuffix}${suffix}`;
        case CustomFormatType.BYTES_SI:
        case CustomFormatType.BYTES_IEC: {
            const {
                compactValue: bytesCompactValue,
                compactSuffix: bytesCompactSuffix,
            } = applyCompact(value, format);
            return `${formatNumberValue(
                bytesCompactValue,
                format,
            )}${bytesCompactSuffix}`;
        }
        case CustomFormatType.CUSTOM:
            return formatValueWithExpression(
                format.custom || '',
                value,
                separatorToNumfmtLocale(format.separator),
                effectiveTimezone,
            );
        default:
            return assertUnreachable(
                format.type,
                `Table calculation format type ${format.type} is not valid`,
            );
    }
}

/**
 * Validates a format string that may contain parameter placeholders.
 * Strips ${...} placeholders before validation since numfmt doesn't understand them.
 */
function isValidFormatWithParameters(formatString: string): boolean {
    // Check if format contains parameter placeholders
    const hasPlaceholders = formatString.includes('${');

    if (!hasPlaceholders) {
        return isValidFormat(formatString);
    }

    // Strip out ${...} placeholders and validate what remains
    // This handles formats like: '${ld.parameters.currency=="usd"?"$":""}0,0.00'
    // After stripping: '0,0.00' which is valid
    const withoutPlaceholders = formatString.replace(/\$\{[^}]+\}/g, '');

    return isValidFormat(withoutPlaceholders);
}

export function hasValidFormatExpression<
    T extends
        | Field
        | AdditionalMetric
        | TableCalculation
        | CustomDimension
        | Dimension,
>(item: T | undefined): item is T & { format: string } {
    // filter out legacy format that might be valid expressions. eg: usd
    if (!item || !('format' in item) || !item.format) {
        return false;
    }

    return (
        (isField(item) || isAdditionalMetric(item)) &&
        typeof item.format === 'string' &&
        !isFormat(item.format) &&
        isValidFormatWithParameters(item.format)
    );
}

const customFormatConversionFnMap: Record<
    string,
    (formatExpression: string, format: CustomFormat) => string
> = {
    separator: (formatExpression, format) => {
        if (
            !format.separator ||
            format.separator !== NumberSeparator.NO_SEPARATOR_PERIOD
        ) {
            // Add thousands separator by default
            // Note: we don't support specific separators characters. This depends on the locale which we don't support as we format values in the server atm.
            return `#,##0`;
        }
        return formatExpression;
    },
    currency: (formatExpression, format) => {
        if (format.currency) {
            const mockAmount = 1;
            const mockCurrencyValue = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: format.currency,
            }).format(mockAmount);
            // get the currency symbol/prefix + replace NBSP char
            const currencySymbolPrefix = mockCurrencyValue
                .substring(0, mockCurrencyValue.indexOf(mockAmount.toString()))
                .replace(/\u00A0/, ' ');
            return `[$${currencySymbolPrefix}]${formatExpression}`;
        }
        return formatExpression;
    },
    prefix: (formatExpression, format) => {
        if (format.prefix) {
            return `"${format.prefix}"${formatExpression}`;
        }
        return formatExpression;
    },
    round: (formatExpression, format) => {
        let round: number | null = 2;
        if (format.round !== undefined) {
            round = format.round;
        } else if (
            format.type === CustomFormatType.CURRENCY &&
            format.currency
        ) {
            const mockCurrencyValue = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: format.currency,
            }).format(1);
            // find how many round decimals the currency has
            round = mockCurrencyValue.includes('.')
                ? mockCurrencyValue.split('.')[1].length
                : 0;
        } else if (format.type === CustomFormatType.NUMBER) {
            round = null;
        }

        if (round === null) {
            // Formatting with null round means we want to show up to 3 decimal places
            return `${formatExpression}.###`;
        }

        if (round > 0) {
            return `${formatExpression}.${'0'.repeat(round)}`;
        }
        return formatExpression;
    },
    compact: (formatExpression, format) => {
        if (format.compact) {
            const compactConfig = findCompactConfig(format.compact);
            if (compactConfig) {
                // Check if this is a binary (IEC) byte unit, like KiB, MiB, etc.
                const isBinaryByteUnit = IECByteCompacts.includes(
                    compactConfig.compact,
                );

                if (isBinaryByteUnit) {
                    return `${formatExpression}"${compactConfig.suffix}"`;
                }
                return `${formatExpression}${','.repeat(
                    compactConfig.orderOfMagnitude / 3,
                )}"${compactConfig.suffix}"`;
            }
        }
        return formatExpression;
    },
    percentage: (formatExpression) => `${formatExpression}%`,
    suffix: (formatExpression, format) => {
        if (format.suffix) {
            return `${formatExpression}"${format.suffix}"`;
        }
        return formatExpression;
    },
};

export function convertCustomFormatToFormatExpression(
    format: CustomFormat,
): string | null {
    // ECMA-376 format expression
    let defaultFormatExpression: string | null = null;
    let conversions: Array<string> = [];
    switch (format.type) {
        case CustomFormatType.CUSTOM: {
            // no conversion needed
            return format.custom || null;
        }
        case CustomFormatType.DEFAULT: {
            // No format expression needed
            break;
        }
        case CustomFormatType.CURRENCY: {
            defaultFormatExpression = '0';
            conversions = ['separator', 'currency', 'round', 'compact'];
            break;
        }
        case CustomFormatType.PERCENT: {
            defaultFormatExpression = '0';
            conversions = ['separator', 'round', 'percentage'];
            break;
        }
        case CustomFormatType.NUMBER: {
            defaultFormatExpression = `0`;
            conversions = ['separator', 'prefix', 'round', 'compact', 'suffix'];
            break;
        }
        case CustomFormatType.BYTES_SI: {
            defaultFormatExpression = '0';
            conversions = ['separator', 'round', 'compact'];
            break;
        }
        case CustomFormatType.BYTES_IEC: {
            // ECMA-376 format expressions cannot accurately represent binary (1024-based) scaling
            // Use a special format that includes the suffix but no comma scaling
            defaultFormatExpression = '0';
            conversions = ['separator', 'round', 'compact'];
            break;
        }
        case CustomFormatType.ID:
        case CustomFormatType.DATE:
        case CustomFormatType.TIMESTAMP: {
            // No format expression needed
            break;
        }
        default: {
            return assertUnreachable(
                format.type,
                `Cannot recognise ${format.type} format type`,
            );
        }
    }
    if (defaultFormatExpression === null) {
        return defaultFormatExpression;
    }
    // Apply conversions
    return conversions.reduce<string>(
        (expression, fnKey) =>
            customFormatConversionFnMap[fnKey](expression, format),
        defaultFormatExpression,
    );
}

export function getFormatExpression(
    item: Item | AdditionalMetric,
): string | undefined {
    if (hasValidFormatExpression(item)) {
        return item.format;
    }

    const customFormat = getCustomFormat(item);
    return customFormat
        ? convertCustomFormatToFormatExpression(customFormat) || undefined
        : undefined;
}

export function getExcelFormatExpression(
    item: Item | AdditionalMetric,
): string | undefined {
    const formatExpression = getFormatExpression(item);
    if (
        formatExpression === '#,##0.###' &&
        isMetric(item) &&
        [MetricType.COUNT, MetricType.COUNT_DISTINCT].includes(item.type) &&
        !hasFormatting(item)
    ) {
        return '#,##0';
    }

    return formatExpression;
}

export function formatItemValue(
    item:
        | Field
        | Dimension
        | AdditionalMetric
        | TableCalculation
        | CustomDimension
        | undefined,
    value: unknown,
    convertToUTC?: boolean,
    parameters?: Record<string, unknown>,
    timezone?: string,
    displayTimezone?: string,
): string {
    if (value === null) return '∅';
    if (value === undefined) return '-';
    if (item) {
        // One timezone decision for every temporal branch below.
        const effectiveTimezone = getFormatterTimezone(item, value, timezone);

        if (hasValidFormatExpression(item)) {
            // A field-level separator localises the ECMA-376 expression, which
            // numfmt otherwise renders with US separators regardless of locale.
            const separatorLocale = getFormatExpressionLocale(item);

            // Check if format uses parameter placeholders
            const hasParameterPlaceholders =
                item.format.includes(
                    `\${${LightdashParameters.PREFIX_SHORT}`,
                ) || item.format.includes(`\${${LightdashParameters.PREFIX}`);

            // NEW: Handle parameter-based formats separately
            if (hasParameterPlaceholders) {
                // If parameters are provided, evaluate and apply the format
                if (parameters) {
                    const formatExpression =
                        evaluateConditionalFormatExpression(
                            item.format,
                            parameters,
                        );
                    try {
                        const result = formatValueWithExpression(
                            formatExpression,
                            value,
                            separatorLocale,
                            effectiveTimezone,
                        );
                        return result;
                    } catch (error) {
                        // If evaluation fails, fall back to default formatting
                        return applyDefaultFormat(value);
                    }
                } else {
                    // No parameters provided but format needs them - use default formatting
                    return applyDefaultFormat(value);
                }
            }

            // EXISTING: Handle non-parameter formats (unchanged behavior)
            try {
                const result = formatValueWithExpression(
                    item.format,
                    value,
                    separatorLocale,
                    effectiveTimezone,
                );
                return result;
            } catch (error) {
                // Fall through to custom format handling below
            }
        }

        const customFormat = getCustomFormat(item);

        if (isCustomSqlDimension(item) || 'type' in item) {
            const type = getItemType(item);

            // Date/Timestamp table calculations may carry a CUSTOM format
            // expression (e.g. "mmmm d, yyyy"). The default switch path
            // hardwires formatDate/formatTimestamp and would silently drop
            // it, so honour the custom expression first.
            if (
                (type === TableCalculationType.DATE ||
                    type === TableCalculationType.TIMESTAMP) &&
                customFormat?.type === CustomFormatType.CUSTOM &&
                customFormat.custom &&
                isMomentInput(value)
            ) {
                try {
                    return formatValueWithExpression(
                        customFormat.custom,
                        value,
                        separatorToNumfmtLocale(customFormat.separator),
                        effectiveTimezone,
                    );
                } catch {
                    // Fall through to the default date/timestamp render.
                }
            }

            switch (type) {
                case TableCalculationType.STRING:
                case DimensionType.STRING:
                case MetricType.STRING:
                    return `${value}`;
                case DimensionType.BOOLEAN:
                case MetricType.BOOLEAN:
                case TableCalculationType.BOOLEAN:
                    return formatBoolean(value);
                case DimensionType.DATE:
                case MetricType.DATE:
                case TableCalculationType.DATE: {
                    // getFormatterTimezone returns undefined for calendar dates,
                    // so effectiveTimezone is safe to pass here.
                    return isMomentInput(value)
                        ? formatDate(
                              value,
                              isDimension(item) ? item.timeInterval : undefined,
                              convertToUTC,
                              effectiveTimezone,
                          )
                        : 'NaT';
                }
                case DimensionType.TIMESTAMP:
                case MetricType.TIMESTAMP:
                case TableCalculationType.TIMESTAMP:
                    return isMomentInput(value)
                        ? formatTimestamp(
                              value,
                              isDimension(item) ? item.timeInterval : undefined,
                              convertToUTC,
                              effectiveTimezone,
                              displayTimezone,
                          )
                        : 'NaT';
                case MetricType.MAX:
                case MetricType.MIN: {
                    const baseType = isMetric(item)
                        ? item.baseDimensionType
                        : undefined;
                    // Behind the flag, a MIN/MAX over a DATE base is a calendar
                    // value: render the bare date at the base grain, never
                    // timezone-shifted, like a DATE dimension. UTC components keep
                    // a midnight-UTC value on the right day in any tz. Wins over a
                    // date/timestamp display format (no real time-of-day); a
                    // field-level format expression is still honoured earlier.
                    if (
                        timezone &&
                        baseType === DimensionType.DATE &&
                        isTemporalValue(value)
                    ) {
                        return formatDate(
                            value,
                            isMetric(item)
                                ? item.baseDimensionTimeInterval
                                : undefined,
                            true,
                            undefined,
                        );
                    }
                    // A temporal MIN/MAX shifts like a dimension; a user-chosen
                    // display format wins and falls through to applyCustomFormat.
                    const formatType = customFormat?.type;
                    const userChoseDisplayFormat =
                        formatType === CustomFormatType.DATE ||
                        formatType === CustomFormatType.TIMESTAMP ||
                        formatType === CustomFormatType.CUSTOM;
                    if (isTemporalValue(value) && !userChoseDisplayFormat) {
                        return formatTimestamp(
                            value,
                            undefined,
                            convertToUTC,
                            effectiveTimezone,
                            displayTimezone,
                        );
                    }
                    break;
                }
                case DimensionType.NUMBER:
                    if (
                        isDimension(item) &&
                        item.timeInterval &&
                        item.timeInterval === TimeFrames.YEAR_NUM // Year number (e.g. 2021) is a number, but should be formatted as a string so there's no separator applied
                    ) {
                        return `${value}`;
                    }
                    break;
                default:
            }
        }

        return applyCustomFormat(value, customFormat, effectiveTimezone);
    }

    return applyDefaultFormat(value);
}
