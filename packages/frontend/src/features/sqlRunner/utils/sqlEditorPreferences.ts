import { WarehouseTypes } from '@lightdash/common';

export type SqlEditorPreferences = {
    quotePreference: 'always' | 'never';
    casePreference: 'lowercase' | 'uppercase' | 'preserve';
    // Whether inserted tables carry the database prefix or just schema.table
    qualification: 'full' | 'schema';
};

type TableReferenceStyle = {
    parts: string[];
    isQuoted: boolean;
};

const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Comments and string literals say nothing about how identifiers are written
const stripLiteralsAndComments = (sql: string): string =>
    sql
        .replace(/--[^\n]*/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/'(?:[^']|'')*'/g, "''");

// Table references in reference positions only; aliases, columns and
// function calls are not evidence of how the user writes table names
const tableReferences = (
    text: string,
    quoteChar: string,
): TableReferenceStyle[] => {
    const q = escapeRegExp(quoteChar);
    const segment = `(?:${q}[^${q}\\n]+${q}|[A-Za-z_][\\w$]*)`;
    const reference = new RegExp(
        `\\b(?:from|join|into|update)\\s+(${segment}(?:\\.${segment})*)`,
        'gi',
    );
    const segments = new RegExp(segment, 'g');
    return [...text.matchAll(reference)].map((match) => {
        const raw = match[1].match(segments) ?? [];
        const parts = raw.flatMap((part) => {
            if (!part.startsWith(quoteChar)) return [part];
            const inner = part.slice(1, -1);
            // Backtick warehouses allow a whole path inside one quote
            return quoteChar === '`' ? inner.split('.') : [inner];
        });
        return {
            parts,
            isQuoted: raw.some((part) => part.startsWith(quoteChar)),
        };
    });
};

const majority = <T extends string>(votes: T[], order: T[]): T | null => {
    if (votes.length === 0) return null;
    const counts = new Map<T, number>();
    votes.forEach((vote) => counts.set(vote, (counts.get(vote) ?? 0) + 1));
    const best = Math.max(...counts.values());
    const winners = order.filter((option) => counts.get(option) === best);
    return winners.length === 1 ? winners[0] : null;
};

const inferCase = (
    references: TableReferenceStyle[],
): SqlEditorPreferences['casePreference'] | null =>
    majority(
        references
            .flatMap((reference) => reference.parts)
            .flatMap((part): SqlEditorPreferences['casePreference'][] => {
                const letters = part.replace(/[^A-Za-z]/g, '');
                if (letters === '') return [];
                if (letters === letters.toUpperCase()) return ['uppercase'];
                if (letters === letters.toLowerCase()) return ['lowercase'];
                return [];
            }),
        ['uppercase', 'lowercase'],
    );

const inferQualification = (
    references: TableReferenceStyle[],
): SqlEditorPreferences['qualification'] | null =>
    majority(
        references.map(({ parts }): SqlEditorPreferences['qualification'] =>
            parts.length >= 3 ? 'full' : 'schema',
        ),
        ['full', 'schema'],
    );

const defaultSqlEditorPreferences = (
    warehouseType: WarehouseTypes | undefined,
): SqlEditorPreferences => ({
    quotePreference: 'always',
    casePreference:
        warehouseType === WarehouseTypes.SNOWFLAKE ? 'uppercase' : 'preserve',
    qualification: 'schema',
});

// Follows the style already in the editor: quote suggestions when the query
// quotes its tables, add the database prefix only when the query does, and on
// Snowflake match the casing of typed identifiers.
export const inferSqlEditorPreferences = (
    sql: string,
    quoteChar: string,
    warehouseType: WarehouseTypes | undefined,
): SqlEditorPreferences => {
    const defaults = defaultSqlEditorPreferences(warehouseType);
    if (!quoteChar) return defaults;
    const references = tableReferences(
        stripLiteralsAndComments(sql),
        quoteChar,
    );
    if (references.length === 0) return defaults;

    const quoted = references.filter((reference) => reference.isQuoted).length;
    const quotePreference =
        quoted >= references.length - quoted ? 'always' : 'never';
    const casePreference =
        warehouseType === WarehouseTypes.SNOWFLAKE
            ? (inferCase(references) ?? defaults.casePreference)
            : defaults.casePreference;
    return {
        quotePreference,
        casePreference,
        qualification: inferQualification(references) ?? defaults.qualification,
    };
};
