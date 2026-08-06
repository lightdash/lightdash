import {
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_ORG_2,
    SEED_PROJECT,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { type Knex } from 'knex';
import { getTestContext } from '../../vitest.setup.integration';
import { AiThreadTableName } from '../database/entities/ai';
import {
    AiMessagePartTableName,
    AiThreadMessageSequenceTableName,
    AiThreadMessageTableName,
} from '../database/entities/aiAgentV3';
import {
    AiArtifactsTableName,
    AiArtifactVersionsTableName,
} from '../database/entities/aiArtifacts';
import { AiAgentV3Model } from './AiAgentV3Model';

const modelConfig = {
    version: 1,
    modelName: 'claude-sonnet-4-5',
    modelProvider: 'anthropic',
    reasoning: { enabled: true, effort: 'high', budgetTokens: null },
    limits: { maxSteps: 12, maxOutputTokens: null },
    sampling: { temperature: 0.2, topP: null },
    providerOptions: null,
};

const textPart = (partIndex: number, text: string) => ({
    partIndex,
    type: 'text' as const,
    payloadVersion: 1,
    payload: { text },
});

describe('AiAgentV3Model', () => {
    let database: Knex;
    let model: AiAgentV3Model;
    const rootThreadUuids = new Set<string>();

    beforeAll(() => {
        database = getTestContext().db;
        model = new AiAgentV3Model({ database });
    });

    afterEach(async () => {
        if (rootThreadUuids.size > 0) {
            await database(AiThreadTableName)
                .whereIn('ai_thread_uuid', [...rootThreadUuids])
                .delete();
        }
        rootThreadUuids.clear();
    });

    const createRootThread = async () => {
        const thread = await model.createThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            agentUuid: null,
            createdFrom: 'web_app',
            lineage: null,
        });
        rootThreadUuids.add(thread.uuid);
        return thread;
    };

    it('keeps legacy threads at storage version 1 and initializes v3 threads', async () => {
        const [legacyThread] = await database(AiThreadTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                agent_uuid: null,
                created_from: 'web_app',
            })
            .returning(['ai_thread_uuid', 'storage_version']);
        rootThreadUuids.add(legacyThread.ai_thread_uuid);

        const v3Thread = await createRootThread();
        const sequence = await database(AiThreadMessageSequenceTableName)
            .where('ai_thread_uuid', v3Thread.uuid)
            .first();

        expect(legacyThread.storage_version).toBe(1);
        expect(v3Thread.storageVersion).toBe(3);
        expect(sequence).toMatchObject({ next_thread_seq: 1 });
        await expect(
            model.appendUserMessage({
                threadUuid: legacyThread.ai_thread_uuid,
                createdByUserUuid: null,
                parts: [textPart(0, 'legacy write')],
            }),
        ).rejects.toThrow('Thread is not writable v3 storage');
        await expect(
            model.createThread({
                organizationUuid: SEED_ORG_1.organization_uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                agentUuid: null,
                createdFrom: 'web_app',
                lineage: {
                    kind: 'fork',
                    parentThreadUuid: legacyThread.ai_thread_uuid,
                    forkBoundarySeq: 1,
                },
            }),
        ).rejects.toThrow('Lineage parent must use storage version 3');
    });

    it('allocates unique ordered message sequences for concurrent writers', async () => {
        const thread = await createRootThread();

        await Promise.all(
            Array.from({ length: 12 }, (_, index) =>
                model.appendUserMessage({
                    threadUuid: thread.uuid,
                    createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
                    parts: [textPart(0, `message-${index}`)],
                }),
            ),
        );

        const rows = await database(AiThreadMessageTableName)
            .select(['thread_seq'])
            .where('ai_thread_uuid', thread.uuid)
            .orderBy('thread_seq');
        const canonical = await model.getThread(thread.uuid);

        expect(rows.map((row) => row.thread_seq)).toEqual(
            Array.from({ length: 12 }, (_, index) => index + 1),
        );
        expect(canonical.messages).toHaveLength(12);
        expect(
            new Set(
                canonical.messages.map(
                    (message) => message.parts[0].payload.text,
                ),
            ).size,
        ).toBe(12);
    });

    it('reports a missing thread when appending a message', async () => {
        await expect(
            model.appendUserMessage({
                threadUuid: randomUUID(),
                createdByUserUuid: null,
                parts: [textPart(0, 'missing')],
            }),
        ).rejects.toThrow('Thread not found');
    });

    it('returns messages and typed parts in canonical order', async () => {
        const thread = await createRootThread();
        const importedCreatedAt = new Date('2024-01-02T03:04:05.000Z');
        const userMessage = await model.appendUserMessage({
            threadUuid: thread.uuid,
            createdByUserUuid: null,
            createdAt: importedCreatedAt,
            parts: [
                textPart(2, 'third'),
                textPart(0, 'first'),
                {
                    partIndex: 1,
                    type: 'source',
                    payloadVersion: 2,
                    payload: { url: 'https://example.com' },
                },
            ],
        });
        const assistantMessage = await model.createAssistantMessage({
            threadUuid: thread.uuid,
            modelConfig,
        });
        await model.appendParts({
            messageUuid: assistantMessage.uuid,
            parts: [textPart(0, 'answer')],
        });
        await expect(
            model.appendParts({
                messageUuid: userMessage.uuid,
                parts: [textPart(3, 'late mutation')],
            }),
        ).rejects.toThrow('Message is not an assistant message');

        const canonical = await model.getThread(thread.uuid);

        expect(canonical).toMatchObject({
            uuid: thread.uuid,
            storageVersion: 3,
            messages: [
                {
                    uuid: userMessage.uuid,
                    role: 'user',
                    metadata: {
                        createdAt: importedCreatedAt.toISOString(),
                        createdByUserUuid: null,
                    },
                    parts: [
                        { type: 'text', payload: { text: 'first' } },
                        {
                            type: 'source',
                            payloadVersion: 2,
                            payload: { url: 'https://example.com' },
                        },
                        { type: 'text', payload: { text: 'third' } },
                    ],
                },
                {
                    uuid: assistantMessage.uuid,
                    role: 'assistant',
                    metadata: {
                        status: 'in_progress',
                        modelConfig,
                    },
                    parts: [{ type: 'text', payload: { text: 'answer' } }],
                },
            ],
        });
    });

    it('scopes part indexes and provider tool call ids to each message', async () => {
        const thread = await createRootThread();
        const [firstMessage, secondMessage] = await Promise.all([
            model.createAssistantMessage({
                threadUuid: thread.uuid,
                modelConfig,
            }),
            model.createAssistantMessage({
                threadUuid: thread.uuid,
                modelConfig,
            }),
        ]);
        const part = {
            partIndex: 0,
            type: 'tool' as const,
            payloadVersion: 1,
            toolCallId: 'provider-call-id',
            payload: { state: 'input-available', toolName: 'findExplores' },
        };

        const [[firstPart], [secondPart]] = await Promise.all([
            model.appendParts({
                messageUuid: firstMessage.uuid,
                parts: [part],
            }),
            model.appendParts({
                messageUuid: secondMessage.uuid,
                parts: [part],
            }),
        ]);

        expect(firstPart.uuid).not.toBe(secondPart.uuid);
        await expect(
            model.appendParts({
                messageUuid: firstMessage.uuid,
                parts: [{ ...part, partIndex: 1 }],
            }),
        ).rejects.toMatchObject({
            constraint:
                'ai_message_part_ai_thread_message_uuid_tool_call_id_unique',
        });
        await expect(
            model.appendParts({
                messageUuid: firstMessage.uuid,
                parts: [textPart(0, 'duplicate index')],
            }),
        ).rejects.toMatchObject({
            constraint:
                'ai_message_part_ai_thread_message_uuid_part_index_unique',
        });
    });

    it('updates a part while its assistant message is writable', async () => {
        const thread = await createRootThread();
        const assistant = await model.createAssistantMessage({
            threadUuid: thread.uuid,
            modelConfig,
        });
        const [part] = await model.appendParts({
            messageUuid: assistant.uuid,
            parts: [
                {
                    partIndex: 0,
                    type: 'tool',
                    payloadVersion: 1,
                    toolCallId: 'update-part',
                    payload: {
                        state: 'input-available',
                        toolName: 'findExplores',
                    },
                },
            ],
        });

        const updated = await model.updatePart({
            messageUuid: assistant.uuid,
            partUuid: part.uuid,
            payloadVersion: 2,
            payload: { state: 'output-available', output: ['orders'] },
        });

        expect(updated).toMatchObject({
            uuid: part.uuid,
            payloadVersion: 2,
            payload: { state: 'output-available', output: ['orders'] },
        });
        expect(
            (await model.getThread(thread.uuid)).messages[0].parts[0],
        ).toMatchObject(updated);
        await expect(
            model.updatePart({
                messageUuid: assistant.uuid,
                partUuid: randomUUID(),
                payloadVersion: 2,
                payload: { state: 'output-available', output: [] },
            }),
        ).rejects.toThrow('Message part not found');
    });

    it('enforces type-specific part references', async () => {
        const thread = await createRootThread();
        const assistant = await model.createAssistantMessage({
            threadUuid: thread.uuid,
            modelConfig,
        });

        await expect(
            model.appendParts({
                messageUuid: assistant.uuid,
                parts: [
                    {
                        ...textPart(0, 'invalid'),
                        toolCallId: 'not-a-text-attribute',
                    } as never,
                ],
            }),
        ).rejects.toThrow('Tool call id is only valid on tool parts');
        await expect(
            model.appendParts({
                messageUuid: assistant.uuid,
                parts: [
                    {
                        partIndex: 0,
                        type: 'tool',
                        payloadVersion: 1,
                        payload: {},
                    } as never,
                ],
            }),
        ).rejects.toThrow('Tool part requires a tool call id');
        await expect(
            model.appendParts({
                messageUuid: assistant.uuid,
                parts: [
                    {
                        partIndex: 0,
                        type: 'artifact',
                        payloadVersion: 1,
                        payload: {},
                    } as never,
                ],
            }),
        ).rejects.toThrow('Artifact part requires an artifact version uuid');
        await expect(
            model.appendUserMessage({
                threadUuid: thread.uuid,
                createdByUserUuid: null,
                parts: [
                    {
                        partIndex: 0,
                        type: 'reasoning',
                        payloadVersion: 1,
                        payload: {},
                    },
                ],
            }),
        ).rejects.toThrow('reasoning parts are not valid on user messages');
        await expect(
            model.appendParts({
                messageUuid: assistant.uuid,
                parts: [
                    {
                        partIndex: 0,
                        type: 'compaction',
                        payloadVersion: 1,
                        payload: { summary: 'not an assistant part' },
                    },
                ],
            }),
        ).rejects.toThrow(
            'compaction parts are not valid on assistant messages',
        );
        await expect(
            database(AiMessagePartTableName).insert({
                ai_thread_message_uuid: assistant.uuid,
                part_index: 10,
                type: 'text',
                payload_version: 1,
                payload: {},
                tool_call_id: 'invalid-text-reference',
            }),
        ).rejects.toMatchObject({
            constraint: 'ai_message_part_tool_call_shape_check',
        });
        await expect(
            database(AiMessagePartTableName).insert({
                ai_thread_message_uuid: assistant.uuid,
                part_index: 11,
                type: 'text',
                payload_version: 1,
                payload: {},
                ai_artifact_version_uuid: randomUUID(),
            }),
        ).rejects.toMatchObject({
            constraint: 'ai_message_part_artifact_version_shape_check',
        });
        await expect(
            model.appendUserMessage({
                threadUuid: thread.uuid,
                createdByUserUuid: null,
                parts: [],
            }),
        ).rejects.toThrow('User message requires content');
    });

    it('deletes artifact parts when their version is deleted', async () => {
        const thread = await createRootThread();
        const [artifact] = await database(AiArtifactsTableName)
            .insert({ ai_thread_uuid: thread.uuid, artifact_type: 'chart' })
            .returning('ai_artifact_uuid');
        const [version] = await database(AiArtifactVersionsTableName)
            .insert({
                ai_artifact_uuid: artifact.ai_artifact_uuid,
                version_number: 1,
            })
            .returning('ai_artifact_version_uuid');
        const assistant = await model.createAssistantMessage({
            threadUuid: thread.uuid,
            modelConfig,
        });
        const [part] = await model.appendParts({
            messageUuid: assistant.uuid,
            parts: [
                {
                    partIndex: 0,
                    type: 'artifact',
                    payloadVersion: 1,
                    payload: {},
                    artifactVersionUuid: version.ai_artifact_version_uuid,
                },
            ],
        });

        await database(AiArtifactVersionsTableName)
            .where('ai_artifact_version_uuid', version.ai_artifact_version_uuid)
            .delete();

        expect(
            await database(AiMessagePartTableName)
                .where('ai_message_part_uuid', part.uuid)
                .first(),
        ).toBeUndefined();
    });

    it('freezes terminal assistant messages and heals active tool parts', async () => {
        const thread = await createRootThread();
        const assistantMessage = await model.createAssistantMessage({
            threadUuid: thread.uuid,
            modelConfig,
        });
        const [toolPart] = await model.appendParts({
            messageUuid: assistantMessage.uuid,
            parts: [
                {
                    partIndex: 0,
                    type: 'tool',
                    payloadVersion: 1,
                    toolCallId: 'call-1',
                    payload: {
                        state: 'input-available',
                        toolName: 'findExplores',
                        input: {},
                    },
                },
            ],
        });

        await model.finishAssistantMessage({
            messageUuid: assistantMessage.uuid,
            status: 'canceled',
            tokenUsage: {
                version: 1,
                inputTokens: 12,
                outputTokens: 3,
                totalTokens: 15,
                reasoningTokens: 1,
                cachedInputTokens: 2,
            },
            error: null,
        });

        await expect(
            model.appendParts({
                messageUuid: assistantMessage.uuid,
                parts: [textPart(1, 'late')],
            }),
        ).rejects.toThrow('Assistant message is frozen');
        await expect(
            model.updatePart({
                messageUuid: assistantMessage.uuid,
                partUuid: toolPart.uuid,
                payloadVersion: 2,
                payload: { state: 'output-available', output: 'late' },
            }),
        ).rejects.toThrow('Assistant message is frozen');

        const canonical = await model.getThread(thread.uuid);
        expect(canonical.messages[0]).toMatchObject({
            metadata: {
                status: 'canceled',
                tokenUsage: { totalTokens: 15 },
            },
            parts: [
                {
                    uuid: toolPart.uuid,
                    payload: {
                        state: 'output-error',
                        error: {
                            name: 'interrupted',
                            message: 'Tool execution was interrupted',
                        },
                    },
                },
            ],
        });
    });

    it('requires model-visible content before completion', async () => {
        const thread = await createRootThread();
        const assistantMessage = await model.createAssistantMessage({
            threadUuid: thread.uuid,
            modelConfig,
        });
        await model.appendParts({
            messageUuid: assistantMessage.uuid,
            parts: [
                {
                    partIndex: 0,
                    type: 'step-start',
                    payloadVersion: 1,
                    payload: {},
                },
            ],
        });

        await expect(
            model.finishAssistantMessage({
                messageUuid: assistantMessage.uuid,
                status: 'completed',
                tokenUsage: null,
                error: null,
            }),
        ).rejects.toThrow('Completed assistant message requires content');

        await model.appendParts({
            messageUuid: assistantMessage.uuid,
            parts: [textPart(1, 'done')],
        });
        await model.finishAssistantMessage({
            messageUuid: assistantMessage.uuid,
            status: 'completed',
            tokenUsage: null,
            error: null,
        });

        expect(
            (await model.getThread(thread.uuid)).messages[0].metadata.status,
        ).toBe('completed');
    });

    it('persists versioned run envelopes and validates error transitions', async () => {
        const thread = await createRootThread();
        const assistantMessage = await model.createAssistantMessage({
            threadUuid: thread.uuid,
            modelConfig,
        });
        const error = {
            version: 1,
            name: 'provider_error',
            message: 'Provider failed',
            data: { retryable: true },
        };

        await expect(
            model.finishAssistantMessage({
                messageUuid: assistantMessage.uuid,
                status: 'error',
                tokenUsage: null,
                error: null,
            }),
        ).rejects.toThrow('Error status requires an error envelope');
        await expect(
            model.finishAssistantMessage({
                messageUuid: assistantMessage.uuid,
                status: 'canceled',
                tokenUsage: null,
                error,
            }),
        ).rejects.toThrow('Error envelope requires error status');

        await model.finishAssistantMessage({
            messageUuid: assistantMessage.uuid,
            status: 'error',
            tokenUsage: null,
            error,
        });

        expect(
            (await model.getThread(thread.uuid)).messages[0].metadata,
        ).toMatchObject({
            status: 'error',
            modelConfig,
            error,
        });
    });

    it('enforces lineage shape, scope, anchors, and fork boundaries', async () => {
        const root = await createRootThread();
        await expect(
            database(AiThreadMessageTableName).insert({
                ai_thread_uuid: root.uuid,
                thread_seq: 999,
                role: 'user',
                status: 'in_progress',
            } as never),
        ).rejects.toMatchObject({
            constraint: 'ai_thread_message_role_status_check',
        });
        await expect(
            database(AiThreadTableName)
                .where('ai_thread_uuid', root.uuid)
                .update({ lineage_kind: 'fork' } as never),
        ).rejects.toMatchObject({
            constraint: 'ai_thread_lineage_shape_check',
        });
        const assistant = await model.createAssistantMessage({
            threadUuid: root.uuid,
            modelConfig,
        });
        await model.appendParts({
            messageUuid: assistant.uuid,
            parts: [
                {
                    partIndex: 0,
                    type: 'tool',
                    payloadVersion: 1,
                    toolCallId: 'delegate-1',
                    payload: { state: 'input-available', toolName: 'delegate' },
                },
            ],
        });
        const userToolMessage = await model.appendUserMessage({
            threadUuid: root.uuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            parts: [textPart(0, 'user message during run')],
        });
        await database(AiMessagePartTableName).insert({
            ai_thread_message_uuid: userToolMessage.uuid,
            part_index: 1,
            type: 'tool',
            payload_version: 1,
            tool_call_id: 'user-tool',
            payload: { state: 'input-available', toolName: 'delegate' },
        });

        const spawn = await model.createThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            agentUuid: null,
            createdFrom: 'web_app',
            lineage: {
                kind: 'spawn',
                parentThreadUuid: root.uuid,
                parentMessageUuid: assistant.uuid,
                parentToolCallId: 'delegate-1',
            },
        });
        await expect(
            model.createThread({
                organizationUuid: SEED_ORG_1.organization_uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                agentUuid: null,
                createdFrom: 'web_app',
                lineage: {
                    kind: 'fork',
                    parentThreadUuid: root.uuid,
                    forkBoundarySeq: assistant.threadSeq,
                },
            }),
        ).rejects.toThrow('Fork boundary assistant message must be frozen');
        await expect(
            model.createThread({
                organizationUuid: SEED_ORG_1.organization_uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                agentUuid: null,
                createdFrom: 'web_app',
                lineage: {
                    kind: 'fork',
                    parentThreadUuid: root.uuid,
                    forkBoundarySeq: userToolMessage.threadSeq,
                },
            }),
        ).rejects.toThrow('Fork prefix contains an active assistant message');
        await model.finishAssistantMessage({
            messageUuid: assistant.uuid,
            status: 'canceled',
            tokenUsage: null,
            error: null,
        });
        const fork = await model.createThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            agentUuid: null,
            createdFrom: 'web_app',
            lineage: {
                kind: 'fork',
                parentThreadUuid: root.uuid,
                forkBoundarySeq: userToolMessage.threadSeq,
            },
        });

        await expect(
            model.createThread({
                organizationUuid: SEED_ORG_2.organization_uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                agentUuid: null,
                createdFrom: 'web_app',
                lineage: {
                    kind: 'fork',
                    parentThreadUuid: root.uuid,
                    forkBoundarySeq: assistant.threadSeq,
                },
            }),
        ).rejects.toThrow('Lineage scope must match its parent');
        await expect(
            model.createThread({
                organizationUuid: SEED_ORG_1.organization_uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                agentUuid: null,
                createdFrom: 'web_app',
                lineage: {
                    kind: 'fork',
                    parentThreadUuid: root.uuid,
                    forkBoundarySeq: 999,
                },
            }),
        ).rejects.toThrow('Fork boundary does not exist');
        await expect(
            model.createThread({
                organizationUuid: SEED_ORG_1.organization_uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                agentUuid: null,
                createdFrom: 'web_app',
                lineage: {
                    kind: 'spawn',
                    parentThreadUuid: root.uuid,
                    parentMessageUuid: assistant.uuid,
                    parentToolCallId: 'missing',
                },
            }),
        ).rejects.toThrow('Spawn anchor does not exist');
        await expect(
            model.createThread({
                organizationUuid: SEED_ORG_1.organization_uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                agentUuid: null,
                createdFrom: 'web_app',
                lineage: {
                    kind: 'spawn',
                    parentThreadUuid: root.uuid,
                    parentMessageUuid: userToolMessage.uuid,
                    parentToolCallId: 'user-tool',
                },
            }),
        ).rejects.toThrow('Spawn anchor does not exist');
        await expect(
            model.createThread({
                organizationUuid: SEED_ORG_1.organization_uuid,
                projectUuid: SEED_PROJECT.project_uuid,
                agentUuid: null,
                createdFrom: 'web_app',
                lineage: {
                    kind: 'fork',
                    parentThreadUuid: spawn.uuid,
                    forkBoundarySeq: 1,
                },
            }),
        ).rejects.toThrow('Spawn threads cannot be forked');

        expect(spawn.lineage).toMatchObject({ kind: 'spawn' });
        expect(fork.lineage).toMatchObject({ kind: 'fork' });
    });

    it('cascades deletion through the entire lineage tree', async () => {
        const root = await createRootThread();
        const rootAssistant = await model.createAssistantMessage({
            threadUuid: root.uuid,
            modelConfig,
        });
        await model.appendParts({
            messageUuid: rootAssistant.uuid,
            parts: [
                {
                    partIndex: 0,
                    type: 'tool',
                    payloadVersion: 1,
                    toolCallId: 'delegate-root',
                    payload: { state: 'input-available', toolName: 'delegate' },
                },
            ],
        });
        await model.finishAssistantMessage({
            messageUuid: rootAssistant.uuid,
            status: 'canceled',
            tokenUsage: null,
            error: null,
        });
        const child = await model.createThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            agentUuid: null,
            createdFrom: 'web_app',
            lineage: {
                kind: 'fork',
                parentThreadUuid: root.uuid,
                forkBoundarySeq: rootAssistant.threadSeq,
            },
        });
        const childAssistant = await model.createAssistantMessage({
            threadUuid: child.uuid,
            modelConfig,
        });
        await model.appendParts({
            messageUuid: childAssistant.uuid,
            parts: [
                {
                    partIndex: 0,
                    type: 'tool',
                    payloadVersion: 1,
                    toolCallId: 'delegate-child',
                    payload: { state: 'input-available', toolName: 'delegate' },
                },
            ],
        });
        const grandchild = await model.createThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            agentUuid: null,
            createdFrom: 'web_app',
            lineage: {
                kind: 'spawn',
                parentThreadUuid: child.uuid,
                parentMessageUuid: childAssistant.uuid,
                parentToolCallId: 'delegate-child',
            },
        });

        await database(AiThreadTableName)
            .where('ai_thread_uuid', root.uuid)
            .delete();

        const [threads, messages, parts] = await Promise.all([
            database(AiThreadTableName)
                .select('ai_thread_uuid')
                .whereIn('ai_thread_uuid', [
                    root.uuid,
                    child.uuid,
                    grandchild.uuid,
                ]),
            database(AiThreadMessageTableName)
                .select('ai_thread_message_uuid')
                .whereIn('ai_thread_uuid', [
                    root.uuid,
                    child.uuid,
                    grandchild.uuid,
                ]),
            database(AiMessagePartTableName)
                .select('ai_message_part_uuid')
                .whereIn('ai_thread_message_uuid', [
                    rootAssistant.uuid,
                    childAssistant.uuid,
                ]),
        ]);

        expect(threads).toHaveLength(0);
        expect(messages).toHaveLength(0);
        expect(parts).toHaveLength(0);
    });
});
