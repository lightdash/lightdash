import { expect, it } from 'vitest';
import { type AiCanonicalThread } from '../../database/entities/aiAgentV3';
import {
    getV3MessageRunOptions,
    getV3TriggeringUserMessage,
    projectV3ThreadToModelMessages,
} from './projectV3ThreadToModelMessages';

const thread = (
    messages: AiCanonicalThread['messages'],
): AiCanonicalThread => ({
    uuid: 'thread',
    storageVersion: 3,
    organizationUuid: 'org',
    projectUuid: 'project',
    agentUuid: 'agent',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: null,
    createdFrom: 'web_app',
    title: null,
    lineage: null,
    messages,
});

const metadata = {
    createdAt: '2026-01-01T00:00:00.000Z',
    createdByUserUuid: null,
    status: null,
    lastHeartbeatAt: null,
    modelConfig: null,
    tokenUsage: null,
    error: null,
    hidden: false,
    context: [],
    legacy: null,
};

it('reads only valid persisted tool hints', () => {
    const message = thread([
        {
            uuid: 'user',
            role: 'user',
            metadata,
            parts: [
                {
                    uuid: 'user-text',
                    type: 'text',
                    payloadVersion: 1,
                    payload: {
                        text: 'question',
                        toolHints: ['runSql', 'findExplores'],
                        enableSqlMode: true,
                    },
                    toolCallId: null,
                    artifactVersionUuid: null,
                },
            ],
        },
    ]).messages[0];

    expect(getV3MessageRunOptions(message)).toEqual({
        toolHints: ['runSql', 'findExplores'],
        enableSqlMode: true,
    });
    if (message) message.parts[0]!.payload.toolHints = ['runSql', 1];
    expect(getV3MessageRunOptions(message)).toEqual({
        toolHints: [],
        enableSqlMode: true,
    });
});

it('finds the user message that triggered an assistant before later steers', () => {
    const { messages } = thread([
        {
            uuid: 'trigger',
            role: 'user',
            metadata,
            parts: [],
        },
        {
            uuid: 'assistant',
            role: 'assistant',
            metadata: { ...metadata, status: 'in_progress' },
            parts: [],
        },
        {
            uuid: 'steer',
            role: 'user',
            metadata,
            parts: [],
        },
    ]);

    expect(getV3TriggeringUserMessage(messages, 'assistant')?.uuid).toBe(
        'trigger',
    );
});

it('replays persisted text and tool activity without system messages', () => {
    expect(
        projectV3ThreadToModelMessages(
            thread([
                {
                    uuid: 'user',
                    role: 'user',
                    metadata,
                    parts: [
                        {
                            uuid: 'user-text',
                            type: 'text',
                            payloadVersion: 1,
                            payload: { text: 'question' },
                            toolCallId: null,
                            artifactVersionUuid: null,
                        },
                    ],
                },
                {
                    uuid: 'assistant',
                    role: 'assistant',
                    metadata: { ...metadata, status: 'completed' },
                    parts: [
                        {
                            uuid: 'intro',
                            type: 'text',
                            payloadVersion: 1,
                            payload: { text: 'Checking.' },
                            toolCallId: null,
                            artifactVersionUuid: null,
                        },
                        {
                            uuid: 'tool',
                            type: 'tool',
                            payloadVersion: 1,
                            payload: {
                                state: 'output-available',
                                toolName: 'findExplores',
                                input: { query: 'orders' },
                                output: ['orders'],
                            },
                            toolCallId: 'call-1',
                            artifactVersionUuid: null,
                        },
                        {
                            uuid: 'answer',
                            type: 'text',
                            payloadVersion: 1,
                            payload: { text: 'Found it.' },
                            toolCallId: null,
                            artifactVersionUuid: null,
                        },
                    ],
                },
            ]),
        ),
    ).toEqual([
        { role: 'user', content: 'question' },
        {
            role: 'assistant',
            content: [
                {
                    type: 'text',
                    text: 'Checking.',
                    providerOptions: undefined,
                },
                {
                    type: 'tool-call',
                    toolCallId: 'call-1',
                    toolName: 'findExplores',
                    input: { query: 'orders' },
                    providerOptions: undefined,
                    providerExecuted: undefined,
                },
            ],
        },
        {
            role: 'tool',
            content: [
                {
                    type: 'tool-result',
                    toolCallId: 'call-1',
                    toolName: 'findExplores',
                    output: { type: 'json', value: ['orders'] },
                    providerOptions: undefined,
                },
            ],
        },
        {
            role: 'assistant',
            content: [
                {
                    type: 'text',
                    text: 'Found it.',
                    providerOptions: undefined,
                },
            ],
        },
    ]);
});

it('does not replay an in-progress assistant message', () => {
    expect(
        projectV3ThreadToModelMessages(
            thread([
                {
                    uuid: 'assistant',
                    role: 'assistant',
                    metadata: { ...metadata, status: 'in_progress' },
                    parts: [
                        {
                            uuid: 'partial',
                            type: 'text',
                            payloadVersion: 1,
                            payload: { text: 'partial' },
                            toolCallId: null,
                            artifactVersionUuid: null,
                        },
                    ],
                },
            ]),
        ),
    ).toEqual([]);
});

it('lowers approval decisions and tool errors to model-visible messages', () => {
    expect(
        projectV3ThreadToModelMessages(
            thread([
                {
                    uuid: 'assistant',
                    role: 'assistant',
                    metadata: { ...metadata, status: 'completed' },
                    parts: [
                        {
                            uuid: 'denied-tool',
                            type: 'tool',
                            payloadVersion: 1,
                            payload: {
                                state: 'output-denied',
                                toolName: 'runSql',
                                input: { sql: 'SELECT 1' },
                                approval: {
                                    id: 'approval-1',
                                    approved: false,
                                    reason: 'Denied by user',
                                },
                            },
                            toolCallId: 'call-1',
                            artifactVersionUuid: null,
                        },
                        {
                            uuid: 'failed-tool',
                            type: 'tool',
                            payloadVersion: 1,
                            payload: {
                                state: 'output-error',
                                toolName: 'findExplores',
                                input: { query: 42 },
                                error: {
                                    name: 'invalid_tool_call',
                                    message: 'Expected a string',
                                    data: { rawInput: '{"query":42}' },
                                },
                            },
                            toolCallId: 'call-2',
                            artifactVersionUuid: null,
                        },
                    ],
                },
            ]),
            {
                modelProvider: 'anthropic',
                includeInProgressMessageUuid: null,
            },
        ),
    ).toEqual([
        {
            role: 'assistant',
            content: [
                expect.objectContaining({
                    type: 'tool-call',
                    toolCallId: 'call-1',
                }),
                {
                    type: 'tool-approval-request',
                    approvalId: 'approval-1',
                    toolCallId: 'call-1',
                },
            ],
        },
        {
            role: 'tool',
            content: [
                {
                    type: 'tool-approval-response',
                    approvalId: 'approval-1',
                    approved: false,
                    reason: 'Denied by user',
                    providerExecuted: undefined,
                },
                {
                    type: 'tool-result',
                    toolCallId: 'call-1',
                    toolName: 'runSql',
                    output: {
                        type: 'execution-denied',
                        reason: 'Denied by user',
                    },
                    providerOptions: undefined,
                },
            ],
        },
        {
            role: 'assistant',
            content: [
                expect.objectContaining({
                    type: 'tool-call',
                    toolCallId: 'call-2',
                }),
            ],
        },
        {
            role: 'tool',
            content: [
                {
                    type: 'tool-result',
                    toolCallId: 'call-2',
                    toolName: 'findExplores',
                    output: {
                        type: 'error-json',
                        value: {
                            name: 'invalid_tool_call',
                            message: 'Expected a string',
                            data: { rawInput: '{"query":42}' },
                        },
                    },
                    providerOptions: undefined,
                },
            ],
        },
    ]);
});

it('keeps resumed approval responses last after parallel calls and steers', () => {
    const messages = projectV3ThreadToModelMessages(
        thread([
            {
                uuid: 'assistant',
                role: 'assistant',
                metadata: { ...metadata, status: 'in_progress' },
                parts: ['call-1', 'call-2'].map((toolCallId, index) => ({
                    uuid: `part-${index}`,
                    type: 'tool' as const,
                    payloadVersion: 1,
                    payload: {
                        state: 'approval-responded',
                        toolName: 'runSql',
                        input: { sql: `SELECT ${index + 1}` },
                        approval: {
                            id: `approval-${index + 1}`,
                            approved: true,
                        },
                    },
                    toolCallId,
                    artifactVersionUuid: null,
                })),
            },
            {
                uuid: 'steer',
                role: 'user',
                metadata,
                parts: [
                    {
                        uuid: 'steer-text',
                        type: 'text',
                        payloadVersion: 1,
                        payload: { text: 'Use a smaller result.' },
                        toolCallId: null,
                        artifactVersionUuid: null,
                    },
                ],
            },
        ]),
        {
            modelProvider: null,
            includeInProgressMessageUuid: 'assistant',
        },
    );

    expect(messages.at(-1)).toEqual({
        role: 'tool',
        content: [
            expect.objectContaining({
                type: 'tool-approval-response',
                approvalId: 'approval-1',
                approved: true,
            }),
            expect.objectContaining({
                type: 'tool-approval-response',
                approvalId: 'approval-2',
                approved: true,
            }),
        ],
    });
});

it('replays provider metadata only to the producing provider', () => {
    const providerMetadata = {
        anthropic: {
            signature: 'signed-reasoning',
            encryptedContent: { blob: 'opaque' },
        },
    };
    const canonical = thread([
        {
            uuid: 'assistant',
            role: 'assistant',
            metadata: {
                ...metadata,
                status: 'completed',
                modelConfig: {
                    version: 1,
                    modelName: 'claude-sonnet-4-5',
                    modelProvider: 'anthropic',
                    reasoning: {
                        enabled: true,
                        effort: null,
                        budgetTokens: null,
                    },
                    limits: { maxSteps: 12, maxOutputTokens: null },
                    sampling: { temperature: null, topP: null },
                    providerOptions: null,
                },
            },
            parts: [
                {
                    uuid: 'reasoning',
                    type: 'reasoning',
                    payloadVersion: 1,
                    payload: { text: '', providerMetadata },
                    toolCallId: null,
                    artifactVersionUuid: null,
                },
            ],
        },
    ]);

    expect(
        projectV3ThreadToModelMessages(canonical, {
            modelProvider: 'anthropic',
            includeInProgressMessageUuid: null,
        }),
    ).toEqual([
        {
            role: 'assistant',
            content: [
                {
                    type: 'reasoning',
                    text: '',
                    providerOptions: providerMetadata,
                },
            ],
        },
    ]);
    expect(
        projectV3ThreadToModelMessages(canonical, {
            modelProvider: 'openai',
            includeInProgressMessageUuid: null,
        }),
    ).toEqual([
        {
            role: 'assistant',
            content: [
                {
                    type: 'reasoning',
                    text: '',
                    providerOptions: undefined,
                },
            ],
        },
    ]);
});
