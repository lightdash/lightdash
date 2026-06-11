import { format as formatDateFns, parseISO } from 'date-fns';
import type { Column, FormatFunction, Row } from '@lightdash/query-sdk';

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

function toDate(value: unknown): Date | null {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string') {
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

export function getColumn(
    columns: Column[],
    name: string,
): Column | undefined {
    return columns.find((c) => c.name === name);
}
