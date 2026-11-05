import type { Column, FormatFunction, Row } from '@lightdash/query-sdk';
import { format as formatDateFns, parseISO } from 'date-fns';

export type FormatVariant = 'cell' | 'axis';

type DateGranularity = 'year' | 'quarter' | 'month' | 'week' | 'day';

const DATE_GRANULARITIES: DateGranularity[] = [
    'year',
    'quarter',
    'month',
    'week',
    'day',
];

// Column metadata is grain-less (always `date`/`timestamp`); recover grain from the suffix.
function inferGranularity(name: string): DateGranularity | undefined {
    for (const g of DATE_GRANULARITIES) {
        if (name.endsWith(`_${g}`)) return g;
    }
    return undefined;
}

// Lightdash returns dates/timestamps as the project's wall-clock reading with
// a `Z` suffix (e.g. a March 1st date arrives as '2025-03-01T00:00:00Z').
// Parsing that with `parseISO`/`new Date` and formatting locally shifts it
// into the viewer's timezone — a UTC-7 viewer would see "Feb 28". Render the
// wall-clock components exactly as the server sent them instead.
const ISO_WALL_CLOCK_RE =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?/;

/**
 * A Date whose local-time getters return UTC components, so date-fns `format`
 * renders the stored wall-clock reading in every viewer timezone. A plain
 * `new Date(y, m, d, h, …)` is not enough: the constructor interprets the
 * components in the viewer's timezone and normalizes local times that don't
 * exist there (a DST spring-forward gap turns 02:30 into 03:30). date-fns
 * clones inputs via their own constructor, so the subclass survives `format`.
 * Same mechanism as @date-fns/utc's UTCDate, without the dependency.
 */
class WallClockDate extends Date {
    getFullYear() {
        return this.getUTCFullYear();
    }

    getMonth() {
        return this.getUTCMonth();
    }

    getDate() {
        return this.getUTCDate();
    }

    getDay() {
        return this.getUTCDay();
    }

    getHours() {
        return this.getUTCHours();
    }

    getMinutes() {
        return this.getUTCMinutes();
    }

    getSeconds() {
        return this.getUTCSeconds();
    }

    getMilliseconds() {
        return this.getUTCMilliseconds();
    }

    getTimezoneOffset() {
        return 0;
    }
}

function toDate(value: unknown): Date | null {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string') {
        const wallClock = ISO_WALL_CLOCK_RE.exec(value);
        if (wallClock) {
            const [, year, month, day, hours, minutes, seconds, millis] =
                wallClock;
            const d = new WallClockDate(
                Date.UTC(
                    Number(year),
                    Number(month) - 1,
                    Number(day),
                    Number(hours ?? 0),
                    Number(minutes ?? 0),
                    Number(seconds ?? 0),
                    Number(millis?.padEnd(3, '0') ?? 0),
                ),
            );
            return Number.isNaN(d.getTime()) ? null : d;
        }
        const d = parseISO(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}

// Axis patterns include a 2-digit year so multi-year ranges aren't ambiguous
// (`Mar 8` alone could be 2025 or 2026). Cell variants always carry the full year.
const DATE_PATTERNS: Record<DateGranularity, Record<FormatVariant, string>> = {
    year: { axis: 'yyyy', cell: 'yyyy' },
    quarter: { axis: "QQQ ''yy", cell: 'QQQ yyyy' },
    month: { axis: "MMM ''yy", cell: 'MMM yyyy' },
    week: { axis: "MMM d ''yy", cell: 'MMM d, yyyy' },
    day: { axis: "MMM d ''yy", cell: 'MMM d, yyyy' },
};

const DEFAULT_DATE_PATTERN: Record<FormatVariant, string> = {
    axis: "MMM d ''yy",
    cell: 'MMM d, yyyy',
};

const DEFAULT_TIMESTAMP_PATTERN: Record<FormatVariant, string> = {
    axis: 'MMM d, HH:mm',
    cell: 'MMM d, yyyy HH:mm',
};

export type FormatDateOptions = {
    pattern?: string;
};

export function formatDate(
    value: unknown,
    column?: Column,
    variant: FormatVariant = 'cell',
    opts: FormatDateOptions = {},
): string {
    const date = toDate(value);
    if (!date) return '';
    if (opts.pattern) return formatDateFns(date, opts.pattern);
    const pattern = column?.name
        ? DATE_PATTERNS[inferGranularity(column.name) ?? 'day'][variant]
        : DEFAULT_DATE_PATTERN[variant];
    return formatDateFns(date, pattern);
}

export function formatTimestamp(
    value: unknown,
    column?: Column,
    variant: FormatVariant = 'cell',
    opts: FormatDateOptions = {},
): string {
    const date = toDate(value);
    if (!date) return '';
    if (opts.pattern) return formatDateFns(date, opts.pattern);
    // Truncated timestamps drop the time portion.
    const granularity = column?.name
        ? inferGranularity(column.name)
        : undefined;
    if (granularity && granularity !== 'day') {
        return formatDate(value, column, variant);
    }
    return formatDateFns(date, DEFAULT_TIMESTAMP_PATTERN[variant]);
}

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
});
const fullNumberFormatter = new Intl.NumberFormat('en-US');

export function formatNumber(
    value: unknown,
    variant: FormatVariant = 'cell',
): string {
    if (value === null || value === undefined || value === '') return '';
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return String(value);
    return variant === 'axis'
        ? compactNumberFormatter.format(n)
        : fullNumberFormatter.format(n);
}

// Numbers in `cell` defer to `format()` so currency/% from the dbt YAML are preserved.
export function formatField(
    row: Row,
    column: Column,
    format: FormatFunction,
    variant: FormatVariant = 'cell',
): string {
    const value = row[column.name];
    if (value === null || value === undefined || value === '') return '';
    switch (column.type) {
        case 'date':
            return formatDate(value, column, variant);
        case 'timestamp':
            return formatTimestamp(value, column, variant);
        case 'number':
            return variant === 'axis'
                ? formatNumber(value, 'axis')
                : format(row, column.name);
        default:
            return format(row, column.name);
    }
}

export function getColumn(columns: Column[], name: string): Column | undefined {
    return columns.find((c) => c.name === name);
}
