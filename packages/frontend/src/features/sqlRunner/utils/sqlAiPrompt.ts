import { type SqlRunnerAiTableContext } from '@lightdash/common';
import { type SqlEditorCatalog } from '../components/SqlEditor';

const COMMENT_PROMPT = /^\s*--\s*(.*?)\s*$/;

/** The natural-language prompt in a `-- comment` line, or null. */
export const getSqlAiPrompt = (lineText: string): string | null => {
    const match = COMMENT_PROMPT.exec(lineText);
    const prompt = match?.[1] ?? '';
    return prompt.length > 0 ? prompt : null;
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

/** Tables whose columns the editor has loaded: the open table and those in the SQL. */
export const buildSqlAiKnownTables = (
    catalog: Pick<
        SqlEditorCatalog,
        | 'tableFieldsData'
        | 'detectedTablesFieldData'
        | 'currentTable'
        | 'currentSchema'
    >,
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
    loadedFields.forEach(({ schema, table, name, type }) => {
        const key = `${schema}.${table}`;
        const entry = tables.get(key) ?? { schema, table, columns: [] };
        if (entry.columns.some((column) => column.name === name)) return;
        tables.set(key, {
            ...entry,
            columns: [...entry.columns, { name, type }],
        });
    });
    return [...tables.values()];
};
