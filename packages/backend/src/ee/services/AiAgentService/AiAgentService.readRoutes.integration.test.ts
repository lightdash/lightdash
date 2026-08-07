import { SEED_ORG_1_EDITOR, SEED_PROJECT } from '@lightdash/common';
import {
    getModels,
    getServices,
    getTestContext,
    type IntegrationTestContext,
} from '../../../vitest.setup.integration';
import { AiAgentV3Model } from '../../models/AiAgentV3Model';

const modelConfig = {
    version: 1,
    modelName: 'claude-sonnet-4-5',
    modelProvider: 'anthropic',
    reasoning: { enabled: true, effort: 'high', budgetTokens: null },
    limits: { maxSteps: 12, maxOutputTokens: null },
    sampling: { temperature: 0.2, topP: null },
    providerOptions: null,
};

describe('AiAgentService v3 thread API', () => {
    let context: IntegrationTestContext;
    let agentUuid: string;

    beforeAll(async () => {
        context = getTestContext();
        const agent = await getServices(context.app).aiAgentService.createAgent(
            context.testUser,
            {
                name: `V3 read routes ${crypto.randomUUID().slice(0, 8)}`,
                description: null,
                projectUuid: SEED_PROJECT.project_uuid,
                tags: null,
                integrations: [],
                instruction: '',
                groupAccess: [],
                userAccess: [],
                spaceAccess: [],
                imageUrl: null,
                enableDataAccess: true,
                enableSelfImprovement: false,
                version: 2,
            },
        );
        agentUuid = agent.uuid;
    });

    afterAll(async () => {
        await getServices(context.app).aiAgentService.deleteAgent(
            context.testUser,
            agentUuid,
        );
    });

    const createLegacyThread = async ({
        ownerUserUuid = context.testUser.userUuid,
        promptUserUuid = ownerUserUuid,
    }: {
        ownerUserUuid?: string;
        promptUserUuid?: string;
    } = {}) => {
        const model = getModels(context.app).aiAgentModel;
        const threadUuid = await model.createWebAppThread({
            organizationUuid: context.testUser.organizationUuid!,
            projectUuid: SEED_PROJECT.project_uuid,
            userUuid: ownerUserUuid,
            createdFrom: 'web_app',
            agentUuid,
        });
        await model.createWebAppPrompt({
            threadUuid,
            createdByUserUuid: promptUserUuid,
            prompt: 'Legacy question',
        });
        return threadUuid;
    };

    const createV3Thread = async ({
        createdFrom = 'web_app',
        ownerUserUuid = context.testUser.userUuid,
    }: {
        createdFrom?: 'web_app' | 'slack';
        ownerUserUuid?: string;
    } = {}) => {
        const model = new AiAgentV3Model({
            database: context.db,
            prometheusMetrics: null,
        });
        const thread = await model.createThread({
            organizationUuid: context.testUser.organizationUuid!,
            projectUuid: SEED_PROJECT.project_uuid,
            agentUuid,
            createdFrom,
            lineage: null,
            ownerUserUuid,
        });
        await model.appendUserMessage({
            threadUuid: thread.uuid,
            createdByUserUuid: ownerUserUuid,
            parts: [
                {
                    partIndex: 0,
                    type: 'text',
                    payloadVersion: 1,
                    payload: { text: 'V3 question' },
                },
            ],
        });
        return thread.uuid;
    };

    const createOwnerlessV3Thread = async () => {
        const model = new AiAgentV3Model({
            database: context.db,
            prometheusMetrics: null,
        });
        const thread = await model.createThread({
            organizationUuid: context.testUser.organizationUuid!,
            projectUuid: SEED_PROJECT.project_uuid,
            agentUuid,
            createdFrom: 'web_app',
            lineage: null,
        });
        await model.appendUserMessage({
            threadUuid: thread.uuid,
            createdByUserUuid: context.testUser.userUuid,
            parts: [
                {
                    partIndex: 0,
                    type: 'text',
                    payloadVersion: 1,
                    payload: { text: 'Ownerless question' },
                },
            ],
        });
        return thread.uuid;
    };

    it('serves v1 and v3 threads in one wire shape with viewer capabilities', async () => {
        const service = getServices(context.app).aiAgentService;
        const legacyThreadUuid = await createLegacyThread();
        const mixedOwnerLegacyThreadUuid = await createLegacyThread({
            promptUserUuid: SEED_ORG_1_EDITOR.user_uuid,
        });
        const v3ThreadUuid = await createV3Thread();
        const slackThreadUuid = await createV3Thread({
            createdFrom: 'slack',
        });
        const otherOwnerThreadUuid = await createV3Thread({
            ownerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
        });
        const ownerlessThreadUuid = await createOwnerlessV3Thread();
        const model = new AiAgentV3Model({
            database: context.db,
            prometheusMetrics: null,
        });
        const assistant = await model.createAssistantMessage({
            threadUuid: v3ThreadUuid,
            modelConfig,
        });
        await model.appendParts({
            messageUuid: assistant.uuid,
            parts: [
                {
                    partIndex: 0,
                    type: 'tool',
                    payloadVersion: 1,
                    payload: { state: 'output-available' },
                    toolCallId: 'spawn-tool-call',
                },
            ],
        });
        const [spawnThread, forkThread] = await Promise.all([
            model.createThread({
                organizationUuid: context.testUser.organizationUuid!,
                projectUuid: SEED_PROJECT.project_uuid,
                agentUuid,
                createdFrom: 'web_app',
                lineage: {
                    kind: 'spawn',
                    parentThreadUuid: v3ThreadUuid,
                    parentMessageUuid: assistant.uuid,
                    parentToolCallId: 'spawn-tool-call',
                },
                ownerUserUuid: context.testUser.userUuid,
            }),
            model.createThread({
                organizationUuid: context.testUser.organizationUuid!,
                projectUuid: SEED_PROJECT.project_uuid,
                agentUuid,
                createdFrom: 'web_app',
                lineage: {
                    kind: 'fork',
                    parentThreadUuid: v3ThreadUuid,
                    forkBoundarySeq: 1,
                },
                ownerUserUuid: context.testUser.userUuid,
            }),
        ]);

        const [legacy, v3, slack, otherOwner, ownerless] = await Promise.all([
            service.getAgentThreadV3(
                context.testUser,
                SEED_PROJECT.project_uuid,
                agentUuid,
                legacyThreadUuid,
            ),
            service.getAgentThreadV3(
                context.testUser,
                SEED_PROJECT.project_uuid,
                agentUuid,
                v3ThreadUuid,
            ),
            service.getAgentThreadV3(
                context.testUser,
                SEED_PROJECT.project_uuid,
                agentUuid,
                slackThreadUuid,
            ),
            service.getAgentThreadV3(
                context.testUser,
                SEED_PROJECT.project_uuid,
                agentUuid,
                otherOwnerThreadUuid,
            ),
            service.getAgentThreadV3(
                context.testUser,
                SEED_PROJECT.project_uuid,
                agentUuid,
                ownerlessThreadUuid,
            ),
        ]);

        expect(legacy).toMatchObject({
            storageVersion: 1,
            readOnly: true,
            readOnlyReason: 'legacy',
        });
        expect(v3).toMatchObject({
            storageVersion: 3,
            readOnly: false,
            readOnlyReason: null,
        });
        expect(slack).toMatchObject({
            storageVersion: 3,
            readOnly: true,
            readOnlyReason: 'slack',
        });
        expect(otherOwner).toMatchObject({
            storageVersion: 3,
            readOnly: true,
            readOnlyReason: 'not_owner',
        });
        expect(ownerless).toMatchObject({
            storageVersion: 3,
            readOnly: true,
            readOnlyReason: 'not_owner',
        });
        [legacy.messages[0], v3.messages[0]].forEach((message) => {
            expect(message).toEqual(
                expect.objectContaining({
                    uuid: expect.any(String),
                    role: 'user',
                    parts: expect.any(Array),
                    metadata: expect.any(Object),
                }),
            );
        });

        const summaries = await service.listAgentThreadsV3(context.testUser, {
            projectUuid: SEED_PROJECT.project_uuid,
            agentUuid,
            allUsers: true,
        });
        expect(summaries).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    uuid: legacyThreadUuid,
                    storageVersion: 1,
                    readOnlyReason: 'legacy',
                    firstMessage: expect.objectContaining({
                        message: 'Legacy question',
                    }),
                }),
                expect.objectContaining({
                    uuid: mixedOwnerLegacyThreadUuid,
                    user: expect.objectContaining({
                        uuid: context.testUser.userUuid,
                    }),
                }),
                expect.objectContaining({
                    uuid: v3ThreadUuid,
                    storageVersion: 3,
                    readOnly: false,
                    firstMessage: expect.objectContaining({
                        message: 'V3 question',
                    }),
                }),
                expect.objectContaining({
                    uuid: otherOwnerThreadUuid,
                    readOnlyReason: 'not_owner',
                }),
                expect.objectContaining({
                    uuid: ownerlessThreadUuid,
                    user: expect.objectContaining({ uuid: null }),
                    readOnlyReason: 'not_owner',
                }),
                expect.objectContaining({ uuid: forkThread.uuid }),
            ]),
        );
        await expect(
            getModels(context.app).aiAgentModel.findThreadOwnership({
                organizationUuid: context.testUser.organizationUuid!,
                threadUuid: mixedOwnerLegacyThreadUuid,
            }),
        ).resolves.toMatchObject({
            ownerUserUuid: context.testUser.userUuid,
        });
        expect(summaries).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ uuid: spawnThread.uuid }),
            ]),
        );

        await expect(
            service.listAgentThreadsV3(context.testUser, {
                projectUuid: crypto.randomUUID(),
                agentUuid,
                allUsers: true,
            }),
        ).rejects.toMatchObject({ name: 'NotFoundError' });
    });

    it('guards conversation mutations in both directions', async () => {
        const service = getServices(context.app).aiAgentService;
        const legacyThreadUuid = await createLegacyThread();
        const v3ThreadUuid = await createV3Thread();
        const expectReadOnly = (promise: Promise<unknown>) =>
            expect(promise).rejects.toMatchObject({
                name: 'ReadOnlyThreadError',
                statusCode: 409,
            });

        await expectReadOnly(
            service.streamAgentThreadV3Response(context.testUser, {
                agentUuid,
                threadUuid: legacyThreadUuid,
                body: { message: 'Blocked' },
            }),
        );
        await expectReadOnly(
            service.createAgentThreadMessage(
                context.testUser,
                agentUuid,
                v3ThreadUuid,
                { prompt: 'Blocked' },
            ),
        );
        await expectReadOnly(
            service.streamAgentThreadResponse(context.testUser, {
                agentUuid,
                threadUuid: v3ThreadUuid,
                toolHints: [],
            }),
        );
        await expectReadOnly(
            service.generateAgentThreadResponse(context.testUser, {
                agentUuid,
                threadUuid: v3ThreadUuid,
            }),
        );
        await expectReadOnly(
            service.interruptAgentThreadMessageV3(context.testUser, {
                agentUuid,
                threadUuid: legacyThreadUuid,
                messageUuid: crypto.randomUUID(),
            }),
        );
        await expectReadOnly(
            service.interruptAgentThreadMessage(context.testUser, {
                agentUuid,
                threadUuid: v3ThreadUuid,
                messageUuid: crypto.randomUUID(),
            }),
        );
        await expectReadOnly(
            service.createAgentThreadMessageSteerV3(context.testUser, {
                agentUuid,
                threadUuid: legacyThreadUuid,
                messageUuid: crypto.randomUUID(),
                message: 'Blocked',
            }),
        );
        await expectReadOnly(
            service.createAgentThreadMessageSteer(context.testUser, {
                agentUuid,
                threadUuid: v3ThreadUuid,
                messageUuid: crypto.randomUUID(),
                message: 'Blocked',
            }),
        );
    });

    it('rejects approval decisions from a non-owner viewer', async () => {
        const service = getServices(context.app).aiAgentService;
        const threadUuid = await createV3Thread({
            ownerUserUuid: SEED_ORG_1_EDITOR.user_uuid,
        });
        const model = new AiAgentV3Model({
            database: context.db,
            prometheusMetrics: null,
        });
        const assistant = await model.createAssistantMessage({
            threadUuid,
            modelConfig,
        });
        await model.appendParts({
            messageUuid: assistant.uuid,
            parts: [
                {
                    partIndex: 0,
                    type: 'tool',
                    payloadVersion: 1,
                    toolCallId: 'read-only-approval',
                    payload: {
                        state: 'approval-requested',
                        toolName: 'runSql',
                        input: { sql: 'SELECT 1' },
                        approval: { id: 'read-only-approval' },
                    },
                },
            ],
        });

        await expect(
            service.decideToolApproval(context.testUser, {
                projectUuid: SEED_PROJECT.project_uuid,
                agentUuid,
                threadUuid,
                toolCallId: 'read-only-approval',
                decision: 'approved',
                reason: null,
            }),
        ).rejects.toMatchObject({
            name: 'ReadOnlyThreadError',
            statusCode: 409,
        });
    });

    it('keeps approval decisions scoped, bounded, and idempotent after freeze', async () => {
        const service = getServices(context.app).aiAgentService;
        const threadUuid = await createV3Thread();
        const model = new AiAgentV3Model({
            database: context.db,
            prometheusMetrics: null,
        });
        const assistant = await model.createAssistantMessage({
            threadUuid,
            modelConfig,
        });
        await model.appendParts({
            messageUuid: assistant.uuid,
            parts: ['decided-call', 'pending-call'].map(
                (toolCallId, partIndex) => ({
                    partIndex,
                    type: 'tool' as const,
                    payloadVersion: 1,
                    toolCallId,
                    payload: {
                        state: 'approval-requested',
                        toolName: 'findExplores',
                        input: {},
                        approval: { id: `${toolCallId}-approval` },
                    },
                }),
            ),
        });
        const decide = (
            overrides: Partial<{
                projectUuid: string;
                reason: string | null;
            }> = {},
        ) =>
            service.decideToolApproval(context.testUser, {
                projectUuid: SEED_PROJECT.project_uuid,
                agentUuid,
                threadUuid,
                toolCallId: 'decided-call',
                decision: 'rejected',
                reason: null,
                ...overrides,
            });

        await expect(
            decide({ projectUuid: crypto.randomUUID() }),
        ).rejects.toMatchObject({ statusCode: 404 });
        await expect(decide({ reason: 'x'.repeat(1_001) })).rejects.toThrow(
            'Approval reason cannot exceed 1000 characters',
        );
        await expect(decide()).resolves.toEqual({ decision: 'rejected' });
        await expect(model.getThread(threadUuid)).resolves.toMatchObject({
            messages: [
                {},
                {
                    parts: [
                        {
                            payload: {
                                approval: {
                                    reason: null,
                                    decidedByUserUuid:
                                        context.testUser.userUuid,
                                },
                            },
                        },
                    ],
                },
            ],
        });
        await model.finishAssistantMessage({
            messageUuid: assistant.uuid,
            status: 'completed',
            tokenUsage: null,
            error: null,
        });
        await expect(decide()).resolves.toEqual({ decision: 'rejected' });
    });
});
