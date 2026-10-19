import {
    type SqlRunnerAiTableContext,
    type SqlRunnerAiTarget,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
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

export type SqlAiActivePrompt = {
    lineNumber: number;
    prompt: string;
    currentSql: string | null;
};

/** The prompt on the cursor's line. With a selection, Tab indents instead. */
export const getActiveSqlAiPrompt = ({
    sql,
    lineNumber,
    hasSelection,
}: {
    sql: string;
    lineNumber: number;
    hasSelection: boolean;
}): SqlAiActivePrompt | null => {
    if (hasSelection) return null;
    const prompt = getSqlAiPrompt(sql.split('\n')[lineNumber - 1] ?? '');
    if (!prompt) return null;
    return {
        lineNumber,
        prompt,
        currentSql: getSqlWithoutLine(sql, lineNumber),
    };
};

/** The editor state a generation started from. */
export type SqlAiRequestSnapshot = {
    versionId: number;
    target: SqlRunnerAiTarget;
};

/** A response is stale when the query was edited or the warehouse changed since it was requested. */
export const isSqlAiResponseStale = (
    started: SqlAiRequestSnapshot,
    current: SqlAiRequestSnapshot | null,
): boolean =>
    current === null ||
    started.versionId !== current.versionId ||
    !isEqual(started.target, current.target);

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
