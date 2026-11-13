import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import {
    buildAgentRunSqlDescription,
    DEFAULT_RUN_SQL_LIMIT,
    DEFAULT_RUN_SQL_MAX_LIMIT,
    GET_METADATA_DESCRIPTION,
    getMetadataInputSchema,
    GREP_FIELDS_DESCRIPTION,
    grepFieldsInputSchema,
    TOOL_DESCRIBE_WAREHOUSE_TABLE_DESCRIPTION,
    TOOL_EXPLORE_REPO_DESCRIPTION,
    TOOL_LIST_WAREHOUSE_TABLES_DESCRIPTION,
    toolDescribeWarehouseTableArgsSchema,
    toolExploreRepoArgsSchema,
    toolListWarehouseTablesArgsSchema,
    toolRunSqlArgsSchema,
} from '@lightdash/common';
import { generateText, tool } from 'ai';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { aiCopilotConfigSchema } from '../../../../config/aiConfigSchema';
import { getAiConfig } from '../../../../config/parseConfig';
import { getModel } from '../models';
import { getSemanticStudioSystemPrompt } from './systemV2SemanticStudio';

// Live model eval, opt in: SEMANTIC_STUDIO_EVAL=1 plus a provider key. Repository tools are stubs and runSql reads an in-memory table.
const describeEval =
    process.env.SEMANTIC_STUDIO_EVAL === '1' ? describe : describe.skip;
const RUNS = Number(process.env.SEMANTIC_STUDIO_EVAL_RUNS ?? 3);
const TIMEOUT = 300_000;

const MODEL_YAML = `version: 2
models:
  - name: tickets
    meta:
      label: Tickets
    columns:
      - name: ticket_id
        meta:
          dimension:
            type: string
      - name: status
        meta:
          dimension:
            type: string
      - name: channel
        meta:
          dimension:
            type: string
      - name: resolved_at
        meta:
          dimension:
            type: timestamp
      - name: handling_minutes
        meta:
          dimension:
            type: number
          metrics:
            total_handling_minutes:
              type: sum
`;

const MODEL_SQL = `select ticket_id, status, channel, resolved_at, handling_minutes
from {{ ref('stg_tickets') }}
`;

// No status is called "resolved", so a metric built from names alone filters on a value that never occurs.
const SEED_SQL = `create schema if not exists public;
set schema = 'public';
create or replace table public.tickets as
select
    'T' || i as ticket_id,
    case when i % 20 = 0 then 'spam' when i % 5 = 0 then 'open' when i % 3 = 0 then 'closed' else 'solved' end as status,
    case when i % 4 = 0 then 'chat' else 'email' end as channel,
    case when i % 20 = 0 or i % 5 = 0 then null else timestamp '2025-01-01' + interval (i) hour end as resolved_at,
    case when i % 7 = 0 then null else (i % 90) + 1 end as handling_minutes
from range(5000) t(i)`;

let warehouse: DuckDBConnection;

const runSeededSql = async (sql: string, limit: number): Promise<string> => {
    try {
        const reader = await warehouse.runAndReadAll(sql);
        return JSON.stringify(reader.getRowObjectsJson().slice(0, limit));
    } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
};

const runAsk = async (prompt: string, canRunSql: boolean) => {
    const { model, callOptions, providerOptions } = getModel(
        aiCopilotConfigSchema.parse(getAiConfig()),
    );
    const called: { name: string; input: unknown }[] = [];
    const stub = (name: string, output: string) => async (input: unknown) => {
        called.push({ name, input });
        return output;
    };
    const context = { runtime: 'agent' as const };
    const warehouseTools = {
        runSql: tool({
            description: buildAgentRunSqlDescription(
                DEFAULT_RUN_SQL_LIMIT,
                DEFAULT_RUN_SQL_MAX_LIMIT,
            ),
            inputSchema: toolRunSqlArgsSchema,
            execute: async (input) => {
                called.push({ name: 'runSql', input });
                return runSeededSql(input.sql, input.limit);
            },
        }),
        listWarehouseTables: tool({
            description: TOOL_LIST_WAREHOUSE_TABLES_DESCRIPTION,
            inputSchema: toolListWarehouseTablesArgsSchema,
            execute: stub('listWarehouseTables', 'memory.public.tickets'),
        }),
        describeWarehouseTable: tool({
            description: TOOL_DESCRIBE_WAREHOUSE_TABLE_DESCRIPTION,
            inputSchema: toolDescribeWarehouseTableArgsSchema,
            execute: stub(
                'describeWarehouseTable',
                'ticket_id varchar, status varchar, channel varchar, resolved_at timestamp, handling_minutes bigint',
            ),
        }),
    };
    const { text } = await generateText({
        ...callOptions,
        providerOptions,
        model,
        stopWhen: ({ steps }) => steps.length >= 15,
        instructions: getSemanticStudioSystemPrompt({
            agentName: 'Agent',
            date: '2026-01-01',
            instructions: undefined,
            availableExplores: '- tickets: Tickets',
            projectContext: null,
            warehouse: canRunSql ? { type: 'duckdb', schema: 'public' } : null,
            dbt: { opensPullRequest: false, sections: [] },
        }),
        prompt,
        tools: {
            exploreRepo: tool({
                description: TOOL_EXPLORE_REPO_DESCRIPTION,
                inputSchema: toolExploreRepoArgsSchema,
                execute: stub(
                    'exploreRepo',
                    `==> /dbt/models/tickets.yml <==\n${MODEL_YAML}\n==> /dbt/models/tickets.sql <==\n${MODEL_SQL}`,
                ),
            }),
            grepFields: tool({
                description: GREP_FIELDS_DESCRIPTION({
                    ...context,
                    toolName: 'grepFields',
                }),
                inputSchema: grepFieldsInputSchema,
                execute: stub(
                    'grepFields',
                    'tickets/tickets_ticket_id [dimension string]\ntickets/tickets_status [dimension string]\ntickets/tickets_channel [dimension string]\ntickets/tickets_resolved_at [dimension timestamp]\ntickets/tickets_handling_minutes [dimension number]\ntickets/tickets_total_handling_minutes [metric sum]',
                ),
            }),
            getMetadata: tool({
                description: GET_METADATA_DESCRIPTION({
                    ...context,
                    toolName: 'getMetadata',
                }),
                inputSchema: getMetadataInputSchema,
                execute: stub(
                    'getMetadata',
                    'explore tickets (table public.tickets): dimensions ticket_id, status, channel, resolved_at, handling_minutes; metrics total_handling_minutes (sum of handling_minutes)',
                ),
            }),
            ...(canRunSql ? warehouseTools : {}),
        },
    });
    const sqlCalls = called.flatMap(({ name, input }) =>
        name === 'runSql' ? [toolRunSqlArgsSchema.parse(input)] : [],
    );
    process.stdout.write(
        `\n[studio eval] "${prompt}" canRunSql=${canRunSql}\n  tools: ${called.map(({ name }) => name).join(', ')}\n  sql: ${JSON.stringify(sqlCalls)}\n  reply: ${text}\n`,
    );
    return { sqlCalls, text };
};

describeEval(
    'Semantic Studio on a dbt project grounds suggestions in data',
    () => {
        beforeAll(async () => {
            // The unit setup stubs fetch; this suite talks to the provider.
            vi.unstubAllGlobals();
            warehouse = await (
                await DuckDBInstance.create(':memory:')
            ).connect();
            await warehouse.run(SEED_SQL);
        });

        it.each([
            'What metrics are worth adding to the Tickets model?',
            'See opportunities for the Tickets model',
            'Suggest a metric for this model: Tickets',
        ])(
            'looks at real values before answering "%s"',
            async (prompt) => {
                const runs = await Promise.all(
                    Array.from({ length: RUNS }, () => runAsk(prompt, true)),
                );
                runs.forEach(({ sqlCalls, text }) => {
                    expect(sqlCalls.length).toBeGreaterThanOrEqual(1);
                    expect(sqlCalls.length).toBeLessThanOrEqual(2);
                    // The first query reads a bounded sample, not the whole table.
                    expect(sqlCalls[0].sql).toMatch(/limit\s+\d+/i);
                    expect(text).not.toMatch(/status\s*=\s*'resolved'/i);
                });
            },
            TIMEOUT,
        );

        it(
            'does not go looking at data for a change that needs none',
            async () => {
                const runs = await Promise.all(
                    Array.from({ length: RUNS }, () =>
                        runAsk(
                            'Rename the label of Handling minutes on Tickets to Handling time',
                            true,
                        ),
                    ),
                );
                runs.forEach(({ sqlCalls }) =>
                    expect(sqlCalls.length).toBeLessThanOrEqual(1),
                );
            },
            TIMEOUT,
        );

        it(
            'still suggests when the person cannot run SQL',
            async () => {
                const { text } = await runAsk(
                    'What metrics are worth adding to the Tickets model?',
                    false,
                );
                expect(text.length).toBeGreaterThan(0);
            },
            TIMEOUT,
        );
    },
);
