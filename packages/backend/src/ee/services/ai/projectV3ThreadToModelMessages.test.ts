import { expect, it } from 'vitest';
import { type AiCanonicalThread } from '../../database/entities/aiAgentV3';
import { projectV3ThreadToModelMessages } from './projectV3ThreadToModelMessages';

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
