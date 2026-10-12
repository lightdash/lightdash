import { type SqlRunnerAiTableContext } from '@lightdash/common';
import {
    type EditorTables,
    type SqlEditorCatalog,
} from '../components/SqlEditor';

const COMMENT_PROMPT = /^\s*--\s*(.*?)\s*$/;

/** The natural-language prompt in a `-- comment` line, or null. */
export const getSqlAiPrompt = (lineText: string): string | null => {
    const match = COMMENT_PROMPT.exec(lineText);
    const prompt = match?.[1] ?? '';
    return prompt.length > 0 ? prompt : null;
};

const MAX_PROMPT_TABLE_WORDS = 20;

/**
 * Bare table-name candidates from every `-- prompt` line, with singular and
 * plural variants, so the columns of tables a prompt mentions get loaded.
 */
export const getSqlAiPromptTablePaths = (sql: string): string[][] => {
    const words = sql
        .split('\n')
        .map(getSqlAiPrompt)
        .flatMap((prompt) => prompt?.match(/[A-Za-z_]\w{2,}/g) ?? [])
        .slice(0, MAX_PROMPT_TABLE_WORDS)
        .flatMap((word) => {
            const lower = word.toLowerCase();
            return lower.endsWith('s')
                ? [lower, lower.slice(0, -1)]
                : [lower, `${lower}s`];
        });
    return [...new Set(words)].map((word) => [word]);
};

/** Editor content with the prompt line removed, or null when nothing is left. */
export const getSqlWithoutLine = (
    sql: string,
    lineNumber: number,
): string | null => {
    const lines = sql.split('\n');
    lines.splice(lineNumber - 1, 1);
    const rest = lines.join('\n').trim();
    return rest.length > 0 ? rest : null;
};

const listCatalogTables = (
    tables: EditorTables | undefined,
): { schema: string; table: string }[] =>
    (tables?.tablesBySchema ?? []).flatMap(({ schema, tables: byName }) =>
        Object.keys(byName).map((table) => ({ schema: String(schema), table })),
    );

/** Every catalog table, with columns for the ones the editor has loaded. */
export const buildSqlAiTables = (
    catalog: SqlEditorCatalog,
): SqlRunnerAiTableContext[] => {
    const { currentSchema, currentTable } = catalog;
    const loadedFields = [
        ...(currentSchema && currentTable
            ? (catalog.tableFieldsData ?? []).map((field) => ({
                  ...field,
                  schema: currentSchema,
                  table: currentTable,
              }))
            : []),
        ...(catalog.detectedTablesFieldData ?? []),
    ];

    const tables = new Map<string, SqlRunnerAiTableContext>();
    listCatalogTables(catalog.transformedData).forEach(({ schema, table }) =>
        tables.set(`${schema}.${table}`, { schema, table, columns: null }),
    );
    // Loaded tables may be missing from a partial catalog, so add them too
    loadedFields.forEach(({ schema, table, name, type }) => {
        const key = `${schema}.${table}`;
        const entry = tables.get(key) ?? { schema, table, columns: null };
        const columns = entry.columns ?? [];
        if (columns.some((column) => column.name === name)) return;
        tables.set(key, { ...entry, columns: [...columns, { name, type }] });
    });
    return [...tables.values()];
};
