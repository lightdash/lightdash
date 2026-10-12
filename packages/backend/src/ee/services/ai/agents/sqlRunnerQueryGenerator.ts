import {
    type GenerateSqlRunnerQueryRequest,
    type SqlRunnerAiTableContext,
    type WarehouseTypes,
} from '@lightdash/common';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../../analytics/aiUsage';
import { type GeneratorModelOptions } from '../models/types';
import { getGeneratorTelemetry } from '../utils/aiCallTelemetry';

const MAX_TABLES_IN_PROMPT = 200;

const SqlRunnerQuerySchema = z.object({
    sql: z
        .string()
        .min(1, 'SQL query must not be empty')
        .describe('One complete, runnable SQL query without markdown fences'),
});

export type GeneratedSqlRunnerQuery = z.infer<typeof SqlRunnerQuerySchema>;

export type SqlRunnerQueryContext = GenerateSqlRunnerQueryRequest & {
    warehouseType: WarehouseTypes;
};

const formatTable = (table: SqlRunnerAiTableContext): string => {
    const name = `${table.schema}.${table.table}`;
    if (table.columns === null) return `  ${name}`;
    const columns = table.columns
        .map((column) => `${column.name} (${column.type})`)
        .join(', ');
    return `  ${name}: ${columns}`;
};

export const buildTableReferenceGuide = (
    tables: SqlRunnerAiTableContext[],
): string => {
    if (tables.length === 0) return 'No tables available.';
    // Tables with known columns first, so truncation drops the least useful ones
    const sorted = [...tables].sort(
        (a, b) => Number(a.columns === null) - Number(b.columns === null),
    );
    const shown = sorted.slice(0, MAX_TABLES_IN_PROMPT).map(formatTable);
    const hidden = sorted.length - shown.length;
    return hidden > 0
        ? `${shown.join('\n')}\n  …and ${hidden} more tables`
        : shown.join('\n');
};

export const buildSqlRunnerQueryMessages = (context: SqlRunnerQueryContext) => [
    {
        role: 'system' as const,
        content: [
            'You write SQL queries for a SQL editor connected to a data warehouse.',
            '',
            'CONTRACT',
            '- Return exactly one complete SQL query that runs as-is in the given warehouse dialect.',
            '- Only reference tables and columns from the available tables list. Tables listed without columns have unknown columns; prefer tables whose columns are listed.',
            '- Qualify tables with their schema, exactly as listed.',
            '- When a current query is given, return the full revised query, keeping everything the request does not ask to change.',
            '- Format the query over multiple lines with uppercase keywords.',
            '- Do not include markdown fences, comments explaining the query, or a trailing semicolon.',
        ].join('\n'),
    },
    {
        role: 'user' as const,
        content: [
            `Request:\n${context.prompt}`,
            `Warehouse dialect: ${context.warehouseType}`,
            `Available tables:\n${buildTableReferenceGuide(context.tables)}`,
            context.currentSql
                ? `Current query to revise:\n${context.currentSql}`
                : undefined,
        ]
            .filter(Boolean)
            .join('\n\n'),
    },
];

const stripMarkdownFences = (sql: string): string =>
    sql
        .trim()
        .replace(/^```[a-z]*\n?/i, '')
        .replace(/\n?```$/, '')
        .replace(/;\s*$/, '')
        .trim();

export async function generateSqlRunnerQuery(
    modelOptions: GeneratorModelOptions,
    context: SqlRunnerQueryContext,
): Promise<GeneratedSqlRunnerQuery> {
    const telemetry = getGeneratorTelemetry(
        modelOptions,
        'generateSqlRunnerQuery',
        'sql-runner-query',
    );
    const result = await generateText({
        model: modelOptions.model,
        ...modelOptions.callOptions,
        providerOptions: modelOptions.providerOptions,
        ...telemetry,
        output: Output.object({ schema: SqlRunnerQuerySchema }),
        allowSystemInMessages: true,
        messages: buildSqlRunnerQueryMessages(context),
    });

    emitAiUsage(telemetry, languageModelUsageToTokens(result.usage));

    return { sql: stripMarkdownFences(result.output.sql) };
}
