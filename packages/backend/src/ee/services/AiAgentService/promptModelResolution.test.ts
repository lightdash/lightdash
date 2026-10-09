import { type AiAgentModelConfig, type SessionUser } from '@lightdash/common';
import { getOrgModelCatalogue, MODEL_PRESETS } from '../ai/models';
import { AiAgentService } from './AiAgentService';

const organizationUuid = 'organization-uuid';
const userUuid = 'user-uuid';
const projectUuid = 'project-uuid';
const agentUuid = 'agent-uuid';
const threadUuid = 'thread-uuid';
const promptUuid = 'prompt-uuid';

const user = { organizationUuid, userUuid } as SessionUser;

const agentModel: AiAgentModelConfig = {
    modelProvider: 'anthropic',
    modelName: 'agent-model',
};
const organizationModel: AiAgentModelConfig = {
    modelProvider: 'anthropic',
    modelName: 'organization-model',
};
const pickedModel: AiAgentModelConfig = {
    modelProvider: 'openai',
    modelName: 'picked-model',
};

const buildService = ({
    agentModelConfig,
    organizationModelConfig,
    threadModelConfig = null,
}: {
    agentModelConfig: AiAgentModelConfig | null;
    organizationModelConfig: AiAgentModelConfig | null;
    threadModelConfig?: AiAgentModelConfig | null;
}) => {
    const createPrompt = vi.fn(
        async (_args: { modelConfig: AiAgentModelConfig | null }) => promptUuid,
    );
    const service = new AiAgentService({
        aiAgentModel: {
            getAgent: vi.fn(async () => ({
                uuid: agentUuid,
                projectUuid,
                modelConfig: agentModelConfig,
            })),
            createWebAppThread: vi.fn(async () => threadUuid),
            createWebAppPrompt: createPrompt,
            createSlackThread: vi.fn(async () => threadUuid),
            createSlackPrompt: createPrompt,
            existsSlackPromptByChannelIdAndPromptTs: vi.fn(async () => false),
            findThreadUuidBySlackChannelIdAndThreadTs: vi.fn(
                async () => threadUuid,
            ),
            findThreadModelConfig: vi.fn(async () => threadModelConfig),
            getThread: vi.fn(async () => ({
                uuid: threadUuid,
                user: { uuid: userUuid },
            })),
            findThreadMessage: vi.fn(async () => ({ uuid: promptUuid })),
            getContextForPromptUuids: vi.fn(async () => new Map()),
        },
        userModel: {
            getUserDetailsByUuid: vi.fn(async () => ({ organizationUuid })),
        },
        aiOrganizationSettingsService: {
            getDefaultModelConfig: vi.fn(async () => organizationModelConfig),
        },
        orgAiCopilotConfigResolver: {
            getOrgModelCatalogue: vi.fn(async () => ({
                catalogue: getOrgModelCatalogue(MODEL_PRESETS.anthropic, {
                    modelVisibility: null,
                    keyAccessibleModelIds: null,
                }),
            })),
        },
        mobilePushNotificationService: {
            startLiveActivitiesForPrompt: vi.fn(async () => undefined),
            enqueueThreadReconciliation: vi.fn(async () => undefined),
        },
        analytics: { track: vi.fn() },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    Object.assign(service, {
        getIsCopilotEnabled: vi.fn(async () => true),
        checkAgentAccess: vi.fn(async () => true),
        checkAgentThreadAccess: vi.fn(async () => true),
        validatePromptContextAccess: vi.fn(async () => undefined),
        assertDataAppThreadContinuable: vi.fn(async () => undefined),
        persistSkillInvocation: vi.fn(async () => undefined),
    });

    const storedModelConfig = () => createPrompt.mock.calls[0]?.[0].modelConfig;

    return { service, storedModelConfig };
};

const sendOnEachPath = {
    'new thread': (
        service: AiAgentService,
        modelConfig: AiAgentModelConfig | undefined,
    ) =>
        service.createAgentThread(user, agentUuid, {
            prompt: 'hi',
            modelConfig,
        }),
    'follow-up': (
        service: AiAgentService,
        modelConfig: AiAgentModelConfig | undefined,
    ) =>
        service.createAgentThreadMessage(user, agentUuid, threadUuid, {
            prompt: 'hi',
            modelConfig,
        }),
    'Slack prompt': (
        service: AiAgentService,
        modelConfig: AiAgentModelConfig | undefined,
    ) =>
        service.createSlackPrompt({
            userUuid,
            projectUuid,
            slackUserId: 'slack-user',
            slackChannelId: 'slack-channel',
            slackThreadTs: undefined,
            prompt: 'hi',
            promptSlackTs: '1700000000.000100',
            agentUuid,
            modelConfig,
        }),
};

describe.each(Object.entries(sendOnEachPath))(
    'prompt model resolution on %s',
    (_, send) => {
        it('uses the model the user explicitly picked', async () => {
            const { service, storedModelConfig } = buildService({
                agentModelConfig: agentModel,
                organizationModelConfig: organizationModel,
            });

            await send(service, pickedModel);

            expect(storedModelConfig()).toEqual(pickedModel);
        });

        it("uses the agent's current model when nothing was picked", async () => {
            const { service, storedModelConfig } = buildService({
                agentModelConfig: agentModel,
                organizationModelConfig: organizationModel,
            });

            await send(service, undefined);

            expect(storedModelConfig()).toEqual(agentModel);
        });

        it('falls back to the organization default when the agent has no model', async () => {
            const { service, storedModelConfig } = buildService({
                agentModelConfig: null,
                organizationModelConfig: organizationModel,
            });

            await send(service, undefined);

            expect(storedModelConfig()).toEqual(organizationModel);
        });

        it('leaves the model unset for the instance default when nothing is configured', async () => {
            const { service, storedModelConfig } = buildService({
                agentModelConfig: null,
                organizationModelConfig: null,
            });

            await send(service, undefined);

            expect(storedModelConfig()).toBeNull();
        });

        it("runs on the replacement when the agent's model is retired and nothing was picked", async () => {
            const { service, storedModelConfig } = buildService({
                agentModelConfig: {
                    modelProvider: 'anthropic',
                    modelName: 'claude-sonnet-5',
                },
                organizationModelConfig: organizationModel,
            });

            await send(service, undefined);

            expect(storedModelConfig()).toEqual({
                modelProvider: 'anthropic',
                modelName: 'claude-sonnet-5-5',
            });
        });
    },
);

const threadModel: AiAgentModelConfig = {
    modelProvider: 'anthropic',
    modelName: 'thread-model',
};

const followUpOnEachPath = {
    'web app follow-up': sendOnEachPath['follow-up'],
    'Slack follow-up': (
        service: AiAgentService,
        modelConfig: AiAgentModelConfig | undefined,
    ) =>
        service.createSlackPrompt({
            userUuid,
            projectUuid,
            slackUserId: 'slack-user',
            slackChannelId: 'slack-channel',
            slackThreadTs: '1700000000.000001',
            prompt: 'hi',
            promptSlackTs: '1700000000.000100',
            agentUuid,
            modelConfig,
        }),
};

describe.each(Object.entries(followUpOnEachPath))(
    'thread model on %s',
    (_, send) => {
        it("keeps the thread's model when the user picked another one", async () => {
            const { service, storedModelConfig } = buildService({
                agentModelConfig: agentModel,
                organizationModelConfig: organizationModel,
                threadModelConfig: threadModel,
            });

            await send(service, pickedModel);

            expect(storedModelConfig()).toEqual(threadModel);
        });

        it("keeps the thread's model after the agent moved to another model", async () => {
            const { service, storedModelConfig } = buildService({
                agentModelConfig: agentModel,
                organizationModelConfig: organizationModel,
                threadModelConfig: threadModel,
            });

            await send(service, undefined);

            expect(storedModelConfig()).toEqual(threadModel);
        });

        it("keeps the thread's model when it is deprecated", async () => {
            const deprecatedModel: AiAgentModelConfig = {
                modelProvider: 'anthropic',
                modelName: 'claude-sonnet-5',
            };
            const { service, storedModelConfig } = buildService({
                agentModelConfig: agentModel,
                organizationModelConfig: organizationModel,
                threadModelConfig: deprecatedModel,
            });

            await send(service, undefined);

            expect(storedModelConfig()).toEqual(deprecatedModel);
        });
    },
);
