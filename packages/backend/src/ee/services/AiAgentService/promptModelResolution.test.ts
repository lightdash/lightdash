import { type AiAgentModelConfig, type SessionUser } from '@lightdash/common';
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
}: {
    agentModelConfig: AiAgentModelConfig | null;
    organizationModelConfig: AiAgentModelConfig | null;
}) => {
    const createWebAppPrompt = vi.fn(
        async (_args: { modelConfig?: AiAgentModelConfig }) => promptUuid,
    );
    const service = new AiAgentService({
        aiAgentModel: {
            getAgent: vi.fn(async () => ({
                uuid: agentUuid,
                projectUuid,
                modelConfig: agentModelConfig,
            })),
            createWebAppThread: vi.fn(async () => threadUuid),
            createWebAppPrompt,
            getThread: vi.fn(async () => ({
                uuid: threadUuid,
                user: { uuid: userUuid },
            })),
            findThreadMessage: vi.fn(async () => ({ uuid: promptUuid })),
            getContextForPromptUuids: vi.fn(async () => new Map()),
        },
        aiOrganizationSettingsService: {
            getDefaultModelConfig: vi.fn(async () => organizationModelConfig),
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

    const storedModelConfig = () =>
        createWebAppPrompt.mock.calls[0]?.[0].modelConfig;

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

            expect(storedModelConfig()).toBeUndefined();
        });
    },
);
