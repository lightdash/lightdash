import {
    QuerySourceType,
    type AiAgentToolCall,
    type AiAgentToolResult,
    type ThreadComposerQueryNode,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildMessageQueryPipelines } from './messageQueryPipelines';

const orders: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders by month',
    exploreName: 'orders',
    dimensions: ['orders_month'],
    metrics: ['orders_count'],
};
const refunds: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'refunds',
    sql: 'select 1',
};
const net: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'net',
    title: 'Net orders',
    sql: 'select 1',
    references: ['orders', 'refunds'],
};

const call = (
    toolCallId: string,
    toolName: string,
    toolArgs: object,
    metadata: Record<string, unknown> | null,
): { toolCall: AiAgentToolCall; toolResult: AiAgentToolResult | null } => ({
    toolCall: {
        uuid: `uuid-${toolCallId}`,
        promptUuid: 'prompt',
        toolCallId,
        parentToolCallId: null,
        createdAt: new Date(),
        toolArgs,
        toolType: 'built-in',
        toolName,
    },
    toolResult:
        metadata === null
            ? null
            : ({
                  uuid: `result-${toolCallId}`,
                  promptUuid: 'prompt',
                  toolCallId,
                  result: '',
                  createdAt: new Date(),
                  toolType: 'built-in',
                  toolName,
                  metadata,
              } as AiAgentToolResult),
});

const success = (queryUuid: string, terminalNodeId: string, title: string) => ({
    status: 'success',
    queryUuid,
    terminalNodeId,
    title,
    description: null,
});

describe('buildMessageQueryPipelines', () => {
    it('returns one pipeline per successful query call, reused nodes included', () => {
        expect(
            buildMessageQueryPipelines({
                toolCalls: [
                    call(
                        'c1',
                        'query',
                        {
                            title: 'Net orders',
                            queries: [refunds, net],
                        },
                        success('q1', 'net', 'Net orders'),
                    ),
                ],
                threadNodes: [orders, refunds, net],
            }),
        ).toEqual([
            {
                queryUuid: 'q1',
                title: 'Net orders',
                terminalNodeId: 'net',
                nodes: [refunds, orders, net],
            },
        ]);
    });

    it('skips failed, pending and non-query tool calls', () => {
        expect(
            buildMessageQueryPipelines({
                toolCalls: [
                    call(
                        'c1',
                        'query',
                        { queries: [orders] },
                        {
                            status: 'error',
                        },
                    ),
                    call('c2', 'query', { queries: [orders] }, null),
                    call(
                        'c3',
                        'visualize',
                        { nodeId: 'orders' },
                        {
                            status: 'success',
                        },
                    ),
                ],
                threadNodes: [orders],
            }),
        ).toEqual([]);
    });

    it('falls back to the terminal node title, then its id, without a call title', () => {
        const pipelines = buildMessageQueryPipelines({
            toolCalls: [
                call(
                    'c1',
                    'query',
                    { queries: [orders] },
                    success('q1', 'orders', 'Composer query results'),
                ),
                call(
                    'c2',
                    'query',
                    { queries: [refunds] },
                    success('q2', 'refunds', 'Composer query results'),
                ),
            ],
            threadNodes: [orders, refunds],
        });
        expect(pipelines.map(({ title }) => title)).toEqual([
            'Orders by month',
            'refunds',
        ]);
    });
});
