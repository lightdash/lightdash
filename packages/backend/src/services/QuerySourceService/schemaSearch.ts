import type { QuerySourceSchemaTable } from '@lightdash/common';
import { compileMatcher } from '../../ee/services/ai/tools/grepFieldsIndex';

/**
 * Sources hold thousands of columns across hundreds of tables, so a schema
 * scan never dumps everything. The three modes, applied uniformly to every
 * source's table list:
 *
 * - Overview (no filter): tables without columns, capped.
 * - Search (`patterns`): grep-style patterns (the grep_fields grammar via
 *   compileMatcher: `|` ORs alternatives, whitespace/`.*` requires all terms)
 *   matched against table and column names, labels and descriptions. Returns
 *   matching tables with only their matching columns; a table matched by name
 *   alone returns columns: null as a pointer to the detail mode.
 * - Detail (`tables`): full columns for the named table references. Combined
 *   with `patterns`, the search runs only within those tables.
 */
export type SchemaScanFilter = {
    patterns?: string[];
    tables?: string[];
};

export type FilteredSchemaTables = {
    tables: QuerySourceSchemaTable[];
    totalTables: number;
    note: string | null;
};

export const MAX_SCAN_PATTERNS = 5;
export const MAX_SCAN_TABLE_REFS = 10;
const OVERVIEW_TABLE_LIMIT = 500;
const SEARCH_TABLE_LIMIT = 25;
const SEARCH_COLUMNS_PER_TABLE = 40;
const DETAIL_COLUMNS_PER_TABLE = 200;

const haystackOf = (parts: (string | null)[]): string =>
    parts
        .filter((part): part is string => part !== null && part !== '')
        .join('\n')
        .toLowerCase();

const joinNotes = (notes: string[]): string | null =>
    notes.length > 0 ? notes.join(' ') : null;

export const applySchemaScanFilter = (
    allTables: QuerySourceSchemaTable[],
    filter: SchemaScanFilter,
): FilteredSchemaTables => {
    const totalTables = allTables.length;
    const notes: string[] = [];

    let scoped = allTables;
    if (filter.tables !== undefined) {
        const wanted = new Set(filter.tables);
        scoped = allTables.filter((table) => wanted.has(table.reference));
        const found = new Set(scoped.map((table) => table.reference));
        const missing = filter.tables.filter((ref) => !found.has(ref));
        if (missing.length > 0) {
            notes.push(
                `Unknown tables (not in this source's schema): ${missing.join(', ')}.`,
            );
        }
    }

    if (filter.patterns !== undefined) {
        const matchers = filter.patterns.map(compileMatcher);
        const matchesAny = (haystack: string): boolean =>
            matchers.some((matches) => matches(haystack));

        const matched: {
            table: QuerySourceSchemaTable;
            columnMatchCount: number;
        }[] = [];
        let truncatedColumns = 0;
        for (const table of scoped) {
            const tableMatched = matchesAny(
                haystackOf([table.reference, table.label, table.description]),
            );
            const matchingColumns = (table.columns ?? []).filter((column) =>
                matchesAny(
                    haystackOf([
                        column.reference,
                        column.label,
                        column.description,
                    ]),
                ),
            );
            if (matchingColumns.length > 0) {
                const shown = matchingColumns.slice(
                    0,
                    SEARCH_COLUMNS_PER_TABLE,
                );
                truncatedColumns += matchingColumns.length - shown.length;
                matched.push({
                    table: { ...table, columns: shown },
                    columnMatchCount: matchingColumns.length,
                });
            } else if (tableMatched) {
                // Name-only match: a pointer to the table, not its columns
                matched.push({
                    table: { ...table, columns: null },
                    columnMatchCount: 0,
                });
            }
        }

        // Tables with column matches are stronger evidence than a name match
        matched.sort((a, b) => b.columnMatchCount - a.columnMatchCount);
        const shownTables = matched.slice(0, SEARCH_TABLE_LIMIT);
        if (matched.length > shownTables.length) {
            notes.push(
                `Showing ${shownTables.length} of ${matched.length} matching tables — use more specific patterns.`,
            );
        }
        if (truncatedColumns > 0) {
            notes.push(
                `${truncatedColumns} matching columns over the ${SEARCH_COLUMNS_PER_TABLE}-per-table cap are not shown — use more specific patterns or fetch one table via tables.`,
            );
        }
        if (shownTables.some((entry) => entry.table.columns === null)) {
            notes.push(
                'Tables with columns: null matched by name only — rescan with their references in tables for column detail.',
            );
        }
        return {
            tables: shownTables.map((entry) => entry.table),
            totalTables,
            note: joinNotes(notes),
        };
    }

    if (filter.tables !== undefined) {
        let truncatedColumns = 0;
        const tables = scoped.map((table) => {
            if (
                table.columns !== null &&
                table.columns.length > DETAIL_COLUMNS_PER_TABLE
            ) {
                truncatedColumns +=
                    table.columns.length - DETAIL_COLUMNS_PER_TABLE;
                return {
                    ...table,
                    columns: table.columns.slice(0, DETAIL_COLUMNS_PER_TABLE),
                };
            }
            return table;
        });
        if (truncatedColumns > 0) {
            notes.push(
                `${truncatedColumns} columns over the ${DETAIL_COLUMNS_PER_TABLE}-per-table cap are not shown — search within the table via patterns instead.`,
            );
        }
        return { tables, totalTables, note: joinNotes(notes) };
    }

    if (totalTables === 0) {
        return { tables: [], totalTables, note: null };
    }
    const shown = scoped.slice(0, OVERVIEW_TABLE_LIMIT);
    notes.push(
        'Overview scan: columns are not included. Search with patterns (matched against table and column names, labels and descriptions) or fetch specific tables with tables.',
    );
    if (scoped.length > shown.length) {
        notes.push(`Showing ${shown.length} of ${scoped.length} tables.`);
    }
    return {
        tables: shown.map((table) => ({ ...table, columns: null })),
        totalTables,
        note: joinNotes(notes),
    };
};
