import { type SessionUser } from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

const organizationUuid = 'organization-uuid';
const userUuid = 'user-uuid';
const projectUuid = 'project-uuid';
const agentUuid = 'agent-uuid';
const threadUuid = 'thread-uuid';
const promptUuid = 'prompt-uuid';
const originUuid = '10000000-0000-4000-8000-000000000003';

const user = { organizationUuid, userUuid } as SessionUser;

const buildService = () => {
    const createWebAppThread = vi.fn(async () => threadUuid);
    const createWebAppPrompt = vi.fn(async () => promptUuid);
    const getThread = vi.fn(async () => ({
        uuid: threadUuid,
        user: { uuid: userUuid },
    }));
    const findThreadMessage = vi.fn(async () => ({ uuid: promptUuid }));
    const startLiveActivitiesForPrompt = vi.fn(async () => undefined);
    const enqueueThreadReconciliation = vi.fn(async () => undefined);
    const service = new AiAgentService({
        aiAgentModel: {
            getAgent: vi.fn(async () => ({
                uuid: agentUuid,
                projectUuid,
                modelConfig: undefined,
            })),
            createWebAppThread,
            createWebAppPrompt,
            getThread,
            findThreadMessage,
        },
        aiOrganizationSettingsService: {
            getDefaultModelConfig: vi.fn(async () => undefined),
        },
        mobilePushNotificationService: {
            startLiveActivitiesForPrompt,
            enqueueThreadReconciliation,
        },
        analytics: { track: vi.fn() },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    Object.assign(service, {
        getIsCopilotEnabled: vi.fn(async () => true),
        checkAgentAccess: vi.fn(async () => true),
        checkAgentThreadAccess: vi.fn(async () => true),
        validatePromptContextAccess: vi.fn(async () => undefined),
    });

    return {
        service,
        createWebAppPrompt,
        startLiveActivitiesForPrompt,
    };
};

describe('AiAgentService mobile push-to-start enqueue', () => {
    it('starts after a web thread prompt is persisted and forwards its origin', async () => {
        const { service, createWebAppPrompt, startLiveActivitiesForPrompt } =
            buildService();

        await service.createAgentThread(user, agentUuid, {
            prompt: 'private prompt text',
            originatingInstallationUuid: originUuid,
        });

        expect(createWebAppPrompt).toHaveBeenCalledBefore(
            startLiveActivitiesForPrompt,
        );
        expect(startLiveActivitiesForPrompt).toHaveBeenCalledWith({
            user,
            projectUuid,
            agentUuid,
            threadUuid,
            promptUuid,
            originatingInstallationUuid: originUuid,
        });
        expect(
            JSON.stringify(startLiveActivitiesForPrompt.mock.calls),
        ).not.toContain('private prompt text');
    });

    it('does not start for a non-web thread origin', async () => {
        const { service, startLiveActivitiesForPrompt } = buildService();

        await service.createAgentThread(
            user,
            agentUuid,
            { prompt: 'scheduled prompt' },
            'scheduler',
        );

        expect(startLiveActivitiesForPrompt).not.toHaveBeenCalled();
    });

    it('starts after an appended web message is persisted', async () => {
        const { service, createWebAppPrompt, startLiveActivitiesForPrompt } =
            buildService();

        await service.createAgentThreadMessage(user, agentUuid, threadUuid, {
            prompt: 'private appended prompt',
            originatingInstallationUuid: originUuid,
        });

        expect(createWebAppPrompt).toHaveBeenCalledBefore(
            startLiveActivitiesForPrompt,
        );
        expect(startLiveActivitiesForPrompt).toHaveBeenCalledWith({
            user,
            projectUuid,
            agentUuid,
            threadUuid,
            promptUuid,
            originatingInstallationUuid: originUuid,
        });
    });

    it('keeps prompt creation successful when remote starts are unavailable', async () => {
        const { service, startLiveActivitiesForPrompt } = buildService();
        startLiveActivitiesForPrompt.mockRejectedValueOnce(
            new Error('scheduler unavailable'),
        );

        await expect(
            service.createAgentThread(user, agentUuid, {
                prompt: 'private prompt text',
            }),
        ).resolves.toEqual(expect.objectContaining({ uuid: threadUuid }));
    });
});
