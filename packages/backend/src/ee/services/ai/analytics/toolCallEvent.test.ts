import {
    FilterOperator,
    ParameterError,
    QuerySourceType,
    WarehouseQueryError,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import type { IsMetadataOnly } from './metadataOnly';
import {
    aiAgentToolCallCompletedPropertiesSchema,
    createToolCallEventTracker,
    summarizeToolCallInput,
    summarizeToolCallResult,
    type AiAgentToolCallCompletedProperties,
    type ToolCallEventInput,
} from './toolCallEvent';

const CANARY = 'CANARY_7f3a';

const context = {
    organizationId: '00000000-0000-4000-8000-000000000001',
    projectId: '00000000-0000-4000-8000-000000000002',
    aiAgentId: '00000000-0000-4000-8000-000000000003',
    threadId: '00000000-0000-4000-8000-000000000004',
    promptId: '00000000-0000-4000-8000-000000000005',
    model: 'claude-sonnet-4-5',
    serverVersion: '3.195.1',
};

const call = (
    overrides: Partial<Omit<ToolCallEventInput, 'attempt'>>,
): Omit<ToolCallEventInput, 'attempt'> => ({
    toolCallId: 'toolu_01',
    toolName: 'runComposerQueries',
    input: {},
    result: {
        type: 'tool-result',
        output: { metadata: { status: 'success' } },
    },
    stepIndex: 0,
    durationMs: 120,
    stage: 'query',
    queryCacheHit: false,
    queryReuseHit: false,
    ...overrides,
});

const canaryComposerInput = {
    title: `Title ${CANARY}`,
    description: `Description ${CANARY}`,
    queries: [
        {
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            nodeId: `node_${CANARY}`,
            title: `Node ${CANARY}`,
            description: `Node description ${CANARY}`,
            exploreName: `explore_${CANARY}`,
            dimensions: [`orders_${CANARY}`],
            metrics: [],
            filters: {
                dimensions: `orders_${CANARY} equals="${CANARY} value" AND orders_amount greaterThan=5`,
                metrics: null,
            },
            customMetrics: [
                { table: `t_${CANARY}`, name: `m_${CANARY}`, filters: CANARY },
            ],
        },
        {
            sourceType: QuerySourceType.SQL,
            nodeId: 'sql_node',
            sql: `select '${CANARY}' as x`,
        },
        {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'duck',
            sql: `select * from sql_node where x = '${CANARY}'`,
            references: ['sql_node'],
        },
        {
            sourceType: QuerySourceType.PYTHON,
            nodeId: 'py',
            code: `def run(inputs, params):\n    return "${CANARY}"`,
            references: ['duck'],
        },
    ],
};

describe('tool call event privacy', () => {
    it('never emits free text from inputs, outputs or errors', () => {
        const emitted: AiAgentToolCallCompletedProperties[] = [];
        const tracker = createToolCallEventTracker(context, (properties) =>
            emitted.push(properties),
        );

        tracker.track(
            call({
                input: canaryComposerInput,
                result: {
                    type: 'tool-result',
                    output: toolErrorOutput(
                        new WarehouseQueryError(`Binder Error: ${CANARY}`, {
                            errorCode: 'duckdb_bind',
                        }),
                        `Error running ${CANARY}.`,
                        { captureToSentry: false },
                    ),
                },
            }),
        );
        tracker.track(
            call({
                toolCallId: 'call_grep',
                toolName: 'grepFields',
                input: { patterns: [CANARY], searchTerm: CANARY },
                result: {
                    type: 'tool-result',
                    output: {
                        result: `Found ${CANARY}`,
                        metadata: { status: 'success', rowCount: 3 },
                        structuredContent: { matches: [CANARY] },
                    },
                },
            }),
        );
        tracker.track(
            call({
                toolCallId: 'call_search',
                toolName: 'searchFieldValues',
                input: { query: CANARY, fieldId: `orders_${CANARY}` },
                result: {
                    type: 'tool-error',
                    error: new ParameterError(`Unknown ${CANARY}`),
                },
            }),
        );
        tracker.track(
            call({
                toolCallId: 'call_docs',
                toolName: 'mcp_docs_search',
                input: { query: CANARY },
                result: {
                    type: 'tool-result',
                    output: {
                        content: [
                            { type: 'text', text: 'notice' },
                            { type: 'text', text: CANARY },
                        ],
                    },
                },
            }),
        );

        expect(emitted).toHaveLength(4);
        expect(JSON.stringify(emitted)).not.toContain(CANARY);
        expect(emitted[0]).toMatchObject({
            outcome: 'error',
            errorCode: 'duckdb_bind',
            composerSemanticLayerNodes: 1,
            composerSqlNodes: 1,
            composerDuckdbNodes: 1,
            composerPythonNodes: 1,
            filterOperators: [
                FilterOperator.EQUALS,
                FilterOperator.GREATER_THAN,
            ],
        });
        expect(emitted[2]).toMatchObject({
            outcome: 'error',
            errorCode: 'invalid_input',
        });
    });

    it('rejects any field outside the metadata allowlist', () => {
        const valid = aiAgentToolCallCompletedPropertiesSchema.parse({
            ...context,
            toolCallId: 'toolu_01',
            toolName: 'runComposerQueries',
            stepIndex: 0,
            durationMs: 1,
            stage: 'query',
            queryCacheHit: null,
            queryReuseHit: null,
            status: 'success',
            outcome: 'ok',
            errorCode: null,
            pythonExceptionType: null,
            rowCount: null,
            truncated: null,
            attempt: 1,
            composerSemanticLayerNodes: null,
            composerSqlNodes: null,
            composerDuckdbNodes: null,
            composerPythonNodes: null,
            composerExternalNodes: null,
            composerApiNodes: null,
            filterOperators: [],
            detour: false,
        });
        const reject = (overrides: Record<string, unknown>) =>
            aiAgentToolCallCompletedPropertiesSchema.safeParse({
                ...valid,
                ...overrides,
            }).success;

        expect(reject({ errorMessage: CANARY })).toBe(false);
        expect(reject({ promptId: CANARY })).toBe(false);
        expect(reject({ toolName: `${CANARY} with spaces` })).toBe(false);
        expect(reject({ errorCode: CANARY })).toBe(false);
        expect(reject({ filterOperators: [CANARY] })).toBe(false);
    });

    it('types the payload as ids, enums, numbers and booleans only', () => {
        const payloadIsMetadataOnly: IsMetadataOnly<AiAgentToolCallCompletedProperties> = true;
        // @ts-expect-error a plain string field is not metadata
        const freeTextRejected: IsMetadataOnly<{ note: string }> = true;
        // @ts-expect-error nor is an array of plain strings
        const freeTextArrayRejected: IsMetadataOnly<{ terms: string[] }> = true;
        expect([
            payloadIsMetadataOnly,
            freeTextRejected,
            freeTextArrayRejected,
        ]).toEqual([true, true, true]);
    });
});

describe('summarizeToolCallResult', () => {
    it('reads the composer preview truncation and empty results', () => {
        expect(
            summarizeToolCallResult({
                type: 'tool-result',
                output: {
                    metadata: { status: 'success' },
                    structuredContent: {
                        rowCount: 900,
                        preview: { rows: [], truncated: true },
                    },
                },
            }),
        ).toEqual({
            outcome: 'ok',
            error: null,
            rowCount: 900,
            truncated: true,
        });
        expect(
            summarizeToolCallResult({
                type: 'tool-result',
                output: { metadata: { status: 'success', rowCount: 0 } },
            }).outcome,
        ).toBe('empty');
    });

    it('treats empty or truncated MCP output as empty', () => {
        const mcp = (text: string) => ({
            type: 'tool-result' as const,
            output: {
                content: [
                    { type: 'text', text: 'notice' },
                    { type: 'text', text },
                ],
            },
        });
        expect(summarizeToolCallResult(mcp('')).outcome).toBe('empty');
        expect(
            summarizeToolCallResult(mcp('rows\n[truncated by Lightdash]')),
        ).toMatchObject({ outcome: 'empty', truncated: true });
        expect(summarizeToolCallResult(mcp('rows')).outcome).toBe('ok');
    });

    it('counts non-text MCP blocks as content', () => {
        expect(
            summarizeToolCallResult({
                type: 'tool-result',
                output: {
                    content: [
                        { type: 'text', text: 'notice' },
                        { type: 'image', data: CANARY, mimeType: 'image/png' },
                    ],
                },
            }).outcome,
        ).toBe('ok');
    });

    it.each([
        ['rejected', 'sql_rejected'],
        ['timeout', 'sql_approval_timeout'],
    ])('treats a %s SQL approval as an error', (status, code) => {
        expect(
            summarizeToolCallResult({
                type: 'tool-result',
                output: { metadata: { status } },
            }),
        ).toMatchObject({
            outcome: 'error',
            error: { code, pythonExceptionType: null },
        });
    });
});

describe('createToolCallEventTracker', () => {
    it('numbers attempts per tool in the order calls start', () => {
        const tracker = createToolCallEventTracker(context, () => {});
        tracker.start('a', 'runComposerQueries');
        tracker.start('b', 'runComposerQueries');
        tracker.track(call({ toolCallId: 'b' }));
        tracker.track(call({ toolCallId: 'g', toolName: 'grepFields' }));
        tracker.track(call({ toolCallId: 'a' }));
        expect(
            tracker
                .calls()
                .map(({ toolCallId, attempt }) => [toolCallId, attempt]),
        ).toEqual([
            ['b', 2],
            ['g', 1],
            ['a', 1],
        ]);
    });

    it('emits each tool call once', () => {
        const tracker = createToolCallEventTracker(context, () => {});
        tracker.track(call({}));
        tracker.track(call({}));
        expect(tracker.calls()).toHaveLength(1);
        expect(tracker.isTracked('toolu_01')).toBe(true);
    });

    it('reads filter operators from every tool input shape', () => {
        const operators = (toolName: string, input: unknown) =>
            summarizeToolCallInput(toolName, input).filterOperators;
        expect(
            operators('runQuery', {
                queryConfig: {
                    filters: {
                        dimensions: `orders_status equals=${CANARY}`,
                        metrics: null,
                    },
                },
            }),
        ).toEqual([FilterOperator.EQUALS]);
        expect(
            operators('runQuery', {
                queryConfig: {
                    filters: {
                        type: 'and',
                        dimensions: [
                            {
                                fieldId: `orders_${CANARY}`,
                                operator: FilterOperator.NOT_NULL,
                            },
                        ],
                        metrics: null,
                    },
                },
            }),
        ).toEqual([FilterOperator.NOT_NULL]);
        expect(
            operators('searchFieldValues', {
                filters: `orders_status equals=${CANARY}`,
            }),
        ).toEqual([FilterOperator.EQUALS]);
    });

    it('flags detours into our own repo, docs and tool catalog', () => {
        const detour = (toolName: string, input: unknown) =>
            summarizeToolCallInput(toolName, input).detour;
        expect(detour('exploreRepo', { target: 'lightdash/lightdash' })).toBe(
            true,
        );
        expect(
            detour('exploreRepo', {
                target: null,
                command: 'cat /lightdash/lightdash/README.md',
            }),
        ).toBe(true);
        expect(detour('exploreRepo', { target: 'acme/analytics' })).toBe(false);
        expect(detour('loadMcpTools', {})).toBe(true);
        expect(detour('mcp_lightdash_docs__search_lightdash', {})).toBe(true);
        expect(detour('grepFields', {})).toBe(false);
    });

    it('counts no composer nodes for other tools', () => {
        expect(
            summarizeToolCallInput('runQuery', canaryComposerInput)
                .composerSqlNodes,
        ).toBeNull();
    });
});
