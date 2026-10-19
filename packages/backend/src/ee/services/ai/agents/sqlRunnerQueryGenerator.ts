import {
    type GeneratedSqlRunnerQuery,
    type GenerateSqlRunnerQueryRequest,
    type SqlRunnerAiTableContext,
    type WarehouseTypes,
} from '@lightdash/common';
import { generateText, hasToolCall, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../../analytics/aiUsage';
import { type GeneratorModelOptions } from '../models/types';
import { getDescribeWarehouseTable } from '../tools/describeWarehouseTable';
import { getListWarehouseTables } from '../tools/listWarehouseTables';
import type {
    DescribeWarehouseTableFn,
    ListWarehouseTablesFn,
} from '../types/aiAgentDependencies';
import { getGeneratorTelemetry } from '../utils/aiCallTelemetry';

const MAX_STEPS = 8;

const submitSqlInputSchema = z.object({
    sql: z
        .string()
        .min(1)
        .describe('One complete, runnable SQL query without markdown fences'),
});

// No execute: calling it ends the loop and carries the answer
const submitSql = tool({
    description:
        'Submit the final SQL query. Call this exactly once, when the query is ready.',
    inputSchema: submitSqlInputSchema,
});

export type SqlRunnerQueryContext = Omit<
    GenerateSqlRunnerQueryRequest,
    'target'
> & {
    warehouseType: WarehouseTypes;
};

/** Read-only catalog lookups for the warehouse the editor queries. */
export type SqlRunnerWarehouseCatalog = {
    listWarehouseTables: ListWarehouseTablesFn;
    describeWarehouseTable: DescribeWarehouseTableFn;
};

const formatTable = (table: SqlRunnerAiTableContext): string => {
    const columns = table.columns
        .map((column) => `${column.name} (${column.type})`)
        .join(', ');
    return `  ${table.schema}.${table.table}: ${columns}`;
};

export const buildSqlRunnerQueryMessages = (context: SqlRunnerQueryContext) => [
    {
        role: 'system' as const,
        content: [
            'You write SQL queries for a SQL editor connected to a data warehouse.',
            '',
            'TOOLS',
            '- You only have listWarehouseTables, describeWarehouseTable and submitSql. Ignore mentions of other tools in their descriptions.',
            '- Find candidate tables with listWarehouseTables (search by keyword), then describe each table you use before referencing its columns.',
            '- Tables already known to the editor are listed with their columns; you do not need to describe them again.',
            '- Keep lookups few: stop as soon as you know every table and column the query needs.',
            '',
            'CONTRACT',
            '- Submit exactly one complete SQL query with submitSql. It must run as-is in the given warehouse dialect.',
            '- Only reference tables and columns you have seen in the known tables or in tool results. Never guess a column name.',
            '- Qualify tables as schema.table, without the database, even though listWarehouseTables returns database.schema.table.',
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
            context.knownTables.length > 0
                ? `Known tables:\n${context.knownTables.map(formatTable).join('\n')}`
                : undefined,
            context.currentSql
                ? `Current query to revise:\n${context.currentSql}`
                : undefined,
        ]
            .filter(Boolean)
            .join('\n\n'),
    },
];

export const stripMarkdownFences = (sql: string): string =>
    sql
        .trim()
        .replace(/^```[a-z]*\n?/i, '')
        .replace(/\n?```$/, '')
        .replace(/;\s*$/, '')
        .trim();

export async function generateSqlRunnerQuery(
    modelOptions: GeneratorModelOptions,
    context: SqlRunnerQueryContext,
    catalog: SqlRunnerWarehouseCatalog,
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
        tools: {
            listWarehouseTables: getListWarehouseTables({
                listWarehouseTables: catalog.listWarehouseTables,
            }),
            describeWarehouseTable: getDescribeWarehouseTable({
                describeWarehouseTable: catalog.describeWarehouseTable,
            }),
            submitSql,
        },
        stopWhen: [stepCountIs(MAX_STEPS), hasToolCall('submitSql')],
        // The last step must submit, so a long search still returns SQL
        prepareStep: ({ stepNumber }) =>
            stepNumber === MAX_STEPS - 1
                ? {
                      toolChoice: {
                          type: 'tool' as const,
                          toolName: 'submitSql' as const,
                      },
                  }
                : {},
        allowSystemInMessages: true,
        messages: buildSqlRunnerQueryMessages(context),
    });

    emitAiUsage(telemetry, languageModelUsageToTokens(result.totalUsage));

    const submitted = submitSqlInputSchema.safeParse(
        result.toolCalls.find((call) => call.toolName === 'submitSql')?.input,
    );
    const sql = submitted.success
        ? stripMarkdownFences(submitted.data.sql)
        : '';
    if (sql.length === 0) {
        throw new Error('The model did not return a SQL query');
    }
    return { sql };
}
