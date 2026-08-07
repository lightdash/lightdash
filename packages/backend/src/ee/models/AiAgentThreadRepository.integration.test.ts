import { SEED_ORG_1, SEED_ORG_1_ADMIN, SEED_PROJECT } from '@lightdash/common';
import { type Knex } from 'knex';
import { getTestContext } from '../../vitest.setup.integration';
import {
    AiAgentToolCallTableName,
    AiAgentToolResultTableName,
    AiPromptContextTableName,
    AiPromptSteerTableName,
    AiPromptTableName,
    AiThreadTableName,
} from '../database/entities/ai';
import { AiAgentThreadRepository } from './AiAgentThreadRepository';
import { AiAgentV1ReadAdapter } from './AiAgentV1ReadAdapter';
import { AiAgentV3Model } from './AiAgentV3Model';

describe('AiAgentThreadRepository', () => {
    let database: Knex;
    let repository: AiAgentThreadRepository;
    let v3Model: AiAgentV3Model;
    const threadUuids = new Set<string>();

    beforeAll(() => {
        database = getTestContext().db;
        v3Model = new AiAgentV3Model({ database, prometheusMetrics: null });
        repository = new AiAgentThreadRepository({
            database,
            v1ReadAdapter: new AiAgentV1ReadAdapter({ database }),
            v3Model,
            prometheusMetrics: null,
        });
    });

    afterEach(async () => {
        if (threadUuids.size > 0) {
            await database(AiThreadTableName)
                .whereIn('ai_thread_uuid', [...threadUuids])
                .delete();
        }
        threadUuids.clear();
    });

    it('reads v1 rows through the adapter and v3 rows natively', async () => {
        const [legacyThread] = await database(AiThreadTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                agent_uuid: null,
                created_from: 'web_app',
            })
            .returning('ai_thread_uuid');
        threadUuids.add(legacyThread.ai_thread_uuid);
        const [prompt] = await database(AiPromptTableName)
            .insert({
                ai_thread_uuid: legacyThread.ai_thread_uuid,
                created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                prompt: 'What is revenue?',
            })
            .returning('ai_prompt_uuid');
        await database(AiPromptTableName)
            .where('ai_prompt_uuid', prompt.ai_prompt_uuid)
            .update({
                response: 'Revenue is 42',
                viz_config_output: { type: 'bar' },
                filters_output: { dimensions: ['orders.status'] },
                metric_query: { metrics: ['orders.total'] },
                human_score: 1,
                human_feedback: 'Useful answer',
                responded_at: database.fn.now(),
            });
        const [context] = await database(AiPromptContextTableName)
            .insert({
                ai_prompt_uuid: prompt.ai_prompt_uuid,
                entity_type: 'chart',
                entity_uuid: '00000000-0000-4000-8000-000000000001',
                display_name: 'Revenue chart',
            })
            .returning('ai_prompt_context_uuid');
        await database(AiAgentToolCallTableName).insert({
            ai_prompt_uuid: prompt.ai_prompt_uuid,
            tool_call_id: 'revenue-call',
            tool_name: 'runQuery',
            tool_args: { metric: 'revenue' },
            ai_mcp_server_uuid: null,
            parent_tool_call_id: null,
        });
        await database(AiAgentToolResultTableName).insert({
            ai_prompt_uuid: prompt.ai_prompt_uuid,
            tool_call_id: 'revenue-call',
            tool_name: 'runQuery',
            result: '42',
            metadata: { status: 'success' },
        });
        await database(AiPromptSteerTableName).insert({
            ai_prompt_uuid: prompt.ai_prompt_uuid,
            created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            message: 'Use gross revenue',
        });

        const legacyRead = await repository.getThread(
            legacyThread.ai_thread_uuid,
        );

        expect(legacyRead).toMatchObject({
            uuid: legacyThread.ai_thread_uuid,
            storageVersion: 1,
            messages: [
                {
                    role: 'user',
                    metadata: {
                        context: [
                            {
                                uuid: context.ai_prompt_context_uuid,
                                entityType: 'chart',
                                entityUuid:
                                    '00000000-0000-4000-8000-000000000001',
                                displayName: 'Revenue chart',
                            },
                        ],
                    },
                    parts: [
                        {
                            type: 'text',
                            payload: { text: 'What is revenue?' },
                        },
                    ],
                },
                {
                    role: 'assistant',
                    metadata: {
                        legacy: {
                            vizConfigOutput: { type: 'bar' },
                            filtersOutput: {
                                dimensions: ['orders.status'],
                            },
                            metricQuery: { metrics: ['orders.total'] },
                            humanScore: 1,
                            humanFeedback: 'Useful answer',
                        },
                    },
                    parts: [
                        {
                            type: 'tool',
                            toolCallId: 'revenue-call',
                            payload: {
                                state: 'output-available',
                                output: '42',
                            },
                        },
                        {
                            type: 'text',
                            payload: { text: 'Revenue is 42' },
                        },
                    ],
                },
                {
                    role: 'user',
                    parts: [
                        {
                            type: 'text',
                            payload: { text: 'Use gross revenue' },
                        },
                    ],
                },
            ],
        });

        const v3Thread = await v3Model.createThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            agentUuid: null,
            createdFrom: 'web_app',
            lineage: null,
        });
        threadUuids.add(v3Thread.uuid);
        await v3Model.appendUserMessage({
            threadUuid: v3Thread.uuid,
            createdByUserUuid: SEED_ORG_1_ADMIN.user_uuid,
            parts: [
                {
                    partIndex: 0,
                    type: 'text',
                    payloadVersion: 1,
                    payload: { text: 'Native v3' },
                },
            ],
        });

        await expect(
            repository.getThread(v3Thread.uuid),
        ).resolves.toMatchObject({
            uuid: v3Thread.uuid,
            storageVersion: 3,
            messages: [
                {
                    role: 'user',
                    parts: [{ type: 'text', payload: { text: 'Native v3' } }],
                },
            ],
        });
    });

    it('rejects conversation mutations through the wrong storage API', async () => {
        const [legacyThread] = await database(AiThreadTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                agent_uuid: null,
                created_from: 'web_app',
            })
            .returning('ai_thread_uuid');
        threadUuids.add(legacyThread.ai_thread_uuid);
        const v3Thread = await v3Model.createThread({
            organizationUuid: SEED_ORG_1.organization_uuid,
            projectUuid: SEED_PROJECT.project_uuid,
            agentUuid: null,
            createdFrom: 'web_app',
            lineage: null,
        });
        threadUuids.add(v3Thread.uuid);

        await expect(
            repository.assertMutationStorageVersion(
                legacyThread.ai_thread_uuid,
                3,
            ),
        ).rejects.toMatchObject({
            name: 'ReadOnlyThreadError',
            statusCode: 409,
            data: {
                threadUuid: legacyThread.ai_thread_uuid,
                storageVersion: 1,
            },
        });
        await expect(
            repository.assertMutationStorageVersion(v3Thread.uuid, 1),
        ).rejects.toMatchObject({
            name: 'ReadOnlyThreadError',
            statusCode: 409,
            data: { threadUuid: v3Thread.uuid, storageVersion: 3 },
        });
        await expect(
            repository.assertMutationStorageVersion(
                legacyThread.ai_thread_uuid,
                1,
            ),
        ).resolves.toBeUndefined();
        await expect(
            repository.assertMutationStorageVersion(v3Thread.uuid, 3),
        ).resolves.toBeUndefined();
    });
});
