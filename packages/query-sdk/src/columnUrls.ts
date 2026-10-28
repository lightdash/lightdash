import type { Column, ColumnUrl, FormatFunction, Row } from './types';

export type ResolvedColumnUrl = {
    label: string;
    href: string;
};

type ResolveArgs = {
    /** The column whose cell is being rendered. */
    column: Column;
    /** The result row the cell belongs to (SDK row, keyed by column name). */
    row: Row;
    /** All result columns — used to resolve `${row.<table>.<field>}` references. */
    columns: Column[];
    /** The result's format function, for `.formatted` references. */
    format?: FormatFunction;
};

const TEMPLATE_RE = /\$\{([^}]+)\}/g;

/**
 * Find the row key a `${row.<table>.<field>}` reference points at. SDK rows
 * are keyed by column name: a base-table field is its plain name while a
 * joined field uses dot notation, so both spellings are tried.
 */
const rowKeyForReference = (
    columns: Column[],
    table: string,
    field: string,
): string | null => {
    const dotted = `${table}.${field}`;
    if (columns.some((c) => c.name === dotted)) return dotted;
    if (columns.some((c) => c.name === field)) return field;
    return null;
};

const applyFilters = (value: string, filters: string[]): string | null => {
    let out = value;
    for (const filter of filters) {
        if (filter === 'url_encode') {
            out = encodeURIComponent(out);
        } else {
            // Unknown filter — mirror the dashboard renderer's strict mode
            // and drop the link rather than emit a wrong URL.
            return null;
        }
    }
    return out;
};

/**
 * Resolve one `${...}` expression against the row. Returns null when the
 * reference is invalid, the referenced value is missing, or a filter is
 * unknown — the caller then skips the whole pattern.
 */
const resolveExpression = (
    expression: string,
    { column, row, columns, format }: ResolveArgs,
): string | null => {
    const [ref = '', ...filters] = expression
        .split('|')
        .map((part) => part.trim());
    const parts = ref.split('.').map((part) => part.trim());

    let key: string | null = null;
    let mode: 'raw' | 'formatted' | null = null;
    if (parts.length === 2 && parts[0] === 'value') {
        key = column.name;
        mode = parts[1] === 'raw' || parts[1] === 'formatted' ? parts[1] : null;
    } else if (parts.length === 4 && parts[0] === 'row') {
        key = rowKeyForReference(columns, parts[1], parts[2]);
        mode = parts[3] === 'raw' || parts[3] === 'formatted' ? parts[3] : null;
    }
    if (key === null || mode === null) return null;

    const raw = row[key];
    if (raw === null || raw === undefined) return null;
    const value =
        mode === 'formatted' && format ? format(row, key) : String(raw);
    return applyFilters(value, filters);
};

/**
 * Build the links a cell offers from its column's `urls` patterns. Patterns
 * whose references cannot be resolved against this row (missing field, null
 * value, unknown filter) are skipped, matching dashboard behavior.
 */
export const resolveColumnUrls = (args: ResolveArgs): ResolvedColumnUrl[] => {
    const urls: ColumnUrl[] = args.column.urls ?? [];
    if (urls.length === 0) return [];
    if (args.row[args.column.name] === null) return [];

    const resolved: ResolvedColumnUrl[] = [];
    for (const { label, url } of urls) {
        let failed = false;
        const href = url.replace(TEMPLATE_RE, (match, expression: string) => {
            const substituted = resolveExpression(expression, args);
            if (substituted === null) {
                failed = true;
                return match;
            }
            return substituted;
        });
        if (!failed) resolved.push({ label, href });
    }
    return resolved;
};
