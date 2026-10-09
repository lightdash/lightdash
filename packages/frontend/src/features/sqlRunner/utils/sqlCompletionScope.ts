import { assertUnreachable } from '@lightdash/common';
import type { TablesBySchema } from '../hooks/useTables';
import type { SqlEditorPreferences } from './sqlEditorPreferences';

export type SqlCatalog = {
    database: string;
    tablesBySchema: TablesBySchema;
};

export type QualifiedPrefix = {
    // Offset in the text where the qualified name (qualifiers + partial) starts
    chainStart: number;
    // Identifiers before the last dot, unquoted, e.g. ['silver'] for `silver.or`
    qualifiers: string[];
    // Text typed after the last dot (without quotes)
    partial: string;
    // Offset in the text where `partial` starts
    partialStart: number;
    // Offset of an unclosed opening quote, or null when not inside quotes
    openQuoteStart: number | null;
    // True when the unclosed quote also wraps qualifiers, e.g. `silver.or
    isQuotedPath: boolean;
};

export type CatalogScopeSuggestions = {
    schemas: string[];
    tables: string[];
};

const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const unquoteSegment = (segment: string, quoteChar: string): string[] => {
    if (!segment.startsWith(quoteChar)) return [segment];
    const inner = segment.slice(1, -1);
    // Backtick warehouses allow a whole path inside one quote: `project.dataset`
    return quoteChar === '`' ? inner.split('.') : [inner];
};

export const parseQualifiedPrefix = (
    textUntilCursor: string,
    quoteChar: string,
): QualifiedPrefix => {
    const q = escapeRegExp(quoteChar);
    const word = '[\\p{L}_][\\p{L}\\p{N}_$]*';
    const segment = `(?:${q}[^${q}]*${q}|${word})`;
    // An odd quote count means the cursor is inside a quote opened at the last
    // quote char; otherwise a closed quote earlier on the line is not a prefix
    const isInsideQuote =
        (textUntilCursor.split(quoteChar).length - 1) % 2 === 1;
    const partialPattern = isInsideQuote ? `(${q}[^${q}]*)` : `(${word})?`;
    const match = textUntilCursor.match(
        new RegExp(`((?:${segment}\\.)*)${partialPattern}$`, 'u'),
    );

    const chainStart = match?.index ?? textUntilCursor.length;
    const qualifiersText = match?.[1] ?? '';
    const partialText = match?.[2] ?? '';
    const qualifiers = (
        qualifiersText.match(new RegExp(`${segment}(?=\\.)`, 'gu')) ?? []
    ).flatMap((s) => unquoteSegment(s, quoteChar));

    const partialTextStart = textUntilCursor.length - partialText.length;
    if (!isInsideQuote) {
        return {
            chainStart,
            qualifiers,
            partial: partialText,
            partialStart: partialTextStart,
            openQuoteStart: null,
            isQuotedPath: false,
        };
    }

    const inner = partialText.slice(1);
    const innerParts = quoteChar === '`' ? inner.split('.') : [inner];
    const partial = innerParts[innerParts.length - 1];
    return {
        chainStart,
        qualifiers: [...qualifiers, ...innerParts.slice(0, -1)],
        partial,
        partialStart: textUntilCursor.length - partial.length,
        openQuoteStart: partialTextStart,
        isQuotedPath: innerParts.length > 1,
    };
};

const equalsIgnoreCase = (a: string, b: string) =>
    a.toLowerCase() === b.toLowerCase();

/**
 * Resolves typed qualifiers against the catalog, treating the catalog's
 * database as the default so `schema.` and `database.schema.` both scope to
 * that schema. Returns null when the qualifiers are not a catalog path
 * (e.g. a table alias).
 */
export const getCatalogScopeSuggestions = (
    catalog: SqlCatalog | undefined,
    qualifiers: string[],
): CatalogScopeSuggestions | null => {
    if (!catalog?.tablesBySchema || qualifiers.length === 0) return null;
    const schemas = catalog.tablesBySchema;
    const findSchema = (name: string) =>
        schemas.find((s) => equalsIgnoreCase(s.schema.toString(), name));
    const isDefaultDatabase = (name: string) =>
        equalsIgnoreCase(catalog.database, name);

    if (qualifiers.length === 1) {
        const schema = findSchema(qualifiers[0]);
        const isDatabase = isDefaultDatabase(qualifiers[0]);
        if (!schema && !isDatabase) return null;
        return {
            schemas: isDatabase ? schemas.map((s) => s.schema.toString()) : [],
            tables: schema ? Object.keys(schema.tables) : [],
        };
    }

    if (qualifiers.length === 2 && isDefaultDatabase(qualifiers[0])) {
        const schema = findSchema(qualifiers[1]);
        if (!schema) return null;
        return { schemas: [], tables: Object.keys(schema.tables) };
    }

    return null;
};

export const applyCasePreference = (
    name: string,
    settings: SqlEditorPreferences | undefined,
): string => {
    if (settings?.casePreference === 'lowercase') return name.toLowerCase();
    if (settings?.casePreference === 'uppercase') return name.toUpperCase();
    return name;
};

// The path to insert for a table; the schema always stays, the database is optional
export const tablePathSegments = (
    catalog: Pick<SqlCatalog, 'database'>,
    schema: string,
    table: string,
    qualification: SqlEditorPreferences['qualification'] | undefined,
): string[] => {
    switch (qualification) {
        case 'schema':
            return [schema, table];
        case 'full':
        case undefined:
            return [catalog.database, schema, table];
        default:
            return assertUnreachable(qualification, 'Unknown qualification');
    }
};

export const formatIdentifier = (
    name: string,
    quoteChar: string,
    settings: SqlEditorPreferences | undefined,
): string => {
    const formatted = applyCasePreference(name, settings);
    if (!settings || settings.quotePreference === 'always') {
        return `${quoteChar}${formatted}${quoteChar}`;
    }
    return formatted;
};
