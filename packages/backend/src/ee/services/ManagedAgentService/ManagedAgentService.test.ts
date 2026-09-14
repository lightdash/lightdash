import { Ability } from '@casl/ability';
import {
    AnyType,
    ConflictError,
    ManagedAgentRunStatus,
    ProjectMemberRole,
    ServiceAccountScope,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import type { ManagedAgentRuntime } from '../../../config/parseConfig';
import { getModel } from '../ai/models';
import { ManagedAgentService } from './ManagedAgentService';

vi.mock('../ai/models', () => ({
    getModel: vi.fn(),
}));

const copilotConfig = { defaultProvider: 'anthropic', telemetryEnabled: false };
const resolvedModel = {
    model: {},
    callOptions: {},
    providerOptions: {},
    keyManagement: 'self-managed',
};

const ORGANIZATION_UUID = 'organization-uuid';
const PROJECT_UUID = 'project-uuid';
const SERVICE_ACCOUNT_UUID = 'service-account-uuid';
const USER_UUID = 'user-uuid';

const settings = {
    projectUuid: PROJECT_UUID,
    enabled: true,
    schedule: 'daily',
    enabledByUserUuid: USER_UUID,
    slackChannelId: null,
    toolSettings: {},
    createdAt: new Date('2026-08-03T00:00:00.000Z'),
    updatedAt: new Date('2026-08-03T00:00:00.000Z'),
};

const user = {
    userUuid: USER_UUID,
    organizationUuid: ORGANIZATION_UUID,
    ability: new Ability<PossibleAbilities>([
        {
            action: 'update',
            subject: 'Project',
            conditions: {
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PROJECT_UUID,
            },
        },
    ]),
} as AnyType as SessionUser;

const buildService = ({
    projectGrants = [
        {
            projectUuid: PROJECT_UUID,
            role: ProjectMemberRole.EDITOR,
            roleUuid: null,
        },
    ],
    serviceAccountScopes = [ServiceAccountScope.SYSTEM_MEMBER],
    serviceAccountTokens = [null, 'service-account-token'],
    suggestionsSpaces = [],
    runtime = 'anthropic-managed',
    defaultModelConfig = null,
}: {
    projectGrants?: Array<{
        projectUuid: string;
        role: ProjectMemberRole;
        roleUuid: string | null;
    }>;
    serviceAccountScopes?: ServiceAccountScope[];
    serviceAccountTokens?: Array<string | null>;
    suggestionsSpaces?: Array<{
        uuid: string;
        inheritParentPermissions: boolean;
    }>;
    runtime?: ManagedAgentRuntime;
    defaultModelConfig?: {
        modelProvider: string;
        modelName: string;
        reasoning?: boolean;
    } | null;
} = {}) => {
    vi.mocked(getModel).mockReset();
    vi.mocked(getModel).mockReturnValue(resolvedModel as AnyType);
    const orgAiCopilotConfigResolver = {
        getCopilotConfig: vi.fn().mockResolvedValue(copilotConfig),
    };
    const aiOrganizationSettingsService = {
        getDefaultModelConfig: vi.fn().mockResolvedValue(defaultModelConfig),
    };
    const managedAgentModel = {
        getSettings: vi.fn().mockResolvedValue(settings),
        getLatestRun: vi.fn().mockResolvedValue(null),
        createRunIfIdle: vi.fn().mockResolvedValue(null),
        upsertSettings: vi.fn().mockResolvedValue(settings),
        getServiceAccountToken: vi
            .fn()
            .mockResolvedValueOnce(serviceAccountTokens[0])
            .mockResolvedValueOnce(serviceAccountTokens[1]),
        setServiceAccountToken: vi.fn().mockResolvedValue(undefined),
        getAnthropicResourceIds: vi.fn().mockResolvedValue({
            agentId: null,
            agentConfigHash: null,
            agentVersion: null,
            environmentId: null,
            vaultId: null,
            vaultConfigHash: null,
        }),
    };
    const projectModel = {
        getSummary: vi.fn().mockResolvedValue({
            organizationUuid: ORGANIZATION_UUID,
        }),
        createServiceAccountProjectAccess: vi.fn().mockResolvedValue(undefined),
        getServiceAccountProjectGrants: vi
            .fn()
            .mockResolvedValue(projectGrants),
        setServiceAccountProjectAccess: vi.fn().mockResolvedValue(undefined),
    };
    const serviceAccountModel = {
        create: vi.fn().mockResolvedValue({
            uuid: SERVICE_ACCOUNT_UUID,
            token: 'service-account-token',
        }),
        delete: vi.fn().mockResolvedValue(undefined),
        findByToken: vi.fn().mockResolvedValue({
            uuid: SERVICE_ACCOUNT_UUID,
            description: `Autopilot (${PROJECT_UUID})`,
            scopes: serviceAccountScopes,
        }),
        update: vi.fn().mockResolvedValue(undefined),
    };
    const schedulerClient = {
        scheduleManagedAgentHeartbeat: vi.fn().mockResolvedValue(undefined),
        triggerManagedAgentHeartbeat: vi.fn().mockResolvedValue(undefined),
        cancelManagedAgentHeartbeat: vi.fn().mockResolvedValue(undefined),
    };

    const managedAgentClient = {
        syncAgent: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ManagedAgentService({
        lightdashConfig: {
            managedAgent: { schedule: '0 0 * * *', runtime },
        },
        analytics: { track: vi.fn() },
        managedAgentModel,
        analyticsModel: {},
        organizationModel: {
            get: vi.fn().mockResolvedValue({
                name: 'Organization',
                organizationUuid: ORGANIZATION_UUID,
            }),
        },
        projectModel,
        validationModel: {},
        savedChartModel: {},
        dashboardModel: {},
        spaceModel: {
            find: vi.fn().mockResolvedValue(suggestionsSpaces),
        },
        spacePermissionService: {},
        userModel: {},
        featureFlagModel: {},
        serviceAccountModel,
        schedulerClient,
        slackClient: {},
        managedAgentClient,
        orgAiCopilotConfigResolver,
        aiOrganizationSettingsService,
    } as AnyType);

    return {
        aiOrganizationSettingsService,
        managedAgentClient,
        managedAgentModel,
        projectModel,
        schedulerClient,
        service,
        serviceAccountModel,
    };
};

const startedRun = {
    runUuid: 'run-uuid',
    projectUuid: PROJECT_UUID,
    triggeredBy: 'cron',
    status: ManagedAgentRunStatus.STARTED,
};

describe('ManagedAgentService run locking', () => {
    it('starts a run only when the project has no live run', async () => {
        const { managedAgentModel, service } = buildService();
        managedAgentModel.createRunIfIdle.mockResolvedValueOnce(startedRun);

        await expect(service.startRun(PROJECT_UUID, 'cron')).resolves.toBe(
            startedRun,
        );
        await expect(service.startRun(PROJECT_UUID, 'manual')).rejects.toThrow(
            ConflictError,
        );
    });

    it('refuses run now while a run is live and does not enqueue a job', async () => {
        const { managedAgentModel, schedulerClient, service } = buildService();
        managedAgentModel.getLatestRun.mockResolvedValue(startedRun);

        await expect(
            service.startHeartbeat(user, PROJECT_UUID),
        ).rejects.toThrow(ConflictError);
        expect(
            schedulerClient.triggerManagedAgentHeartbeat,
        ).not.toHaveBeenCalled();
    });

    it('enqueues run now once the latest run has finished', async () => {
        const { managedAgentModel, schedulerClient, service } = buildService();
        managedAgentModel.getLatestRun.mockResolvedValue({
            ...startedRun,
            status: ManagedAgentRunStatus.ERROR,
        });

        await service.startHeartbeat(user, PROJECT_UUID);

        expect(
            schedulerClient.triggerManagedAgentHeartbeat,
        ).toHaveBeenCalledWith(PROJECT_UUID, 'manual');
    });
});

describe('ManagedAgentService.updateSettings', () => {
    it('skips the MCP service account and agent sync on the AI SDK runtime', async () => {
        const {
            managedAgentClient,
            managedAgentModel,
            schedulerClient,
            service,
            serviceAccountModel,
        } = buildService({ runtime: 'ai-sdk' });

        await service.updateSettings(user, PROJECT_UUID, USER_UUID, {
            enabled: true,
        });

        expect(serviceAccountModel.create).not.toHaveBeenCalled();
        expect(managedAgentModel.setServiceAccountToken).not.toHaveBeenCalled();
        expect(managedAgentClient.syncAgent).not.toHaveBeenCalled();
        expect(
            schedulerClient.scheduleManagedAgentHeartbeat,
        ).toHaveBeenCalledWith('0 0 * * *', PROJECT_UUID);
    });

    it('creates a project-scoped service account for MCP authentication', async () => {
        const {
            managedAgentClient,
            managedAgentModel,
            projectModel,
            service,
            serviceAccountModel,
        } = buildService();

        await service.updateSettings(user, PROJECT_UUID, USER_UUID, {
            enabled: true,
        });

        expect(serviceAccountModel.create).toHaveBeenCalledWith({
            user,
            data: {
                organizationUuid: ORGANIZATION_UUID,
                description: `Autopilot (${PROJECT_UUID})`,
                expiresAt: null,
                scopes: [ServiceAccountScope.SYSTEM_MEMBER],
            },
        });
        expect(
            projectModel.createServiceAccountProjectAccess,
        ).toHaveBeenCalledWith(PROJECT_UUID, SERVICE_ACCOUNT_UUID, {
            role: ProjectMemberRole.EDITOR,
            roleUuid: undefined,
        });
        expect(managedAgentModel.setServiceAccountToken).toHaveBeenCalledWith(
            PROJECT_UUID,
            'service-account-token',
        );
        expect(managedAgentClient.syncAgent).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: PROJECT_UUID,
                serviceAccountPat: 'service-account-token',
            }),
        );
    });

    it('restricts an existing organization-scoped account before syncing the agent', async () => {
        const {
            managedAgentClient,
            projectModel,
            service,
            serviceAccountModel,
        } = buildService({
            projectGrants: [
                {
                    projectUuid: 'another-project-uuid',
                    role: ProjectMemberRole.ADMIN,
                    roleUuid: null,
                },
            ],
            serviceAccountScopes: [ServiceAccountScope.ORG_ADMIN],
            serviceAccountTokens: [
                'existing-service-account-token',
                'existing-service-account-token',
            ],
        });

        await service.updateSettings(user, PROJECT_UUID, USER_UUID, {
            enabled: true,
        });

        expect(
            projectModel.setServiceAccountProjectAccess,
        ).toHaveBeenCalledWith(
            SERVICE_ACCOUNT_UUID,
            [
                {
                    projectUuid: PROJECT_UUID,
                    role: ProjectMemberRole.EDITOR,
                },
            ],
            { makeProjectScoped: true },
        );
        expect(serviceAccountModel.update).not.toHaveBeenCalled();
        expect(
            projectModel.setServiceAccountProjectAccess.mock
                .invocationCallOrder[0],
        ).toBeLessThan(
            managedAgentClient.syncAgent.mock.invocationCallOrder[0],
        );
        expect(managedAgentClient.syncAgent).toHaveBeenCalledOnce();
    });

    it('replaces multiple grants on an existing member-scoped account', async () => {
        const { projectModel, service } = buildService({
            projectGrants: [
                {
                    projectUuid: PROJECT_UUID,
                    role: ProjectMemberRole.EDITOR,
                    roleUuid: null,
                },
                {
                    projectUuid: 'another-project-uuid',
                    role: ProjectMemberRole.VIEWER,
                    roleUuid: null,
                },
            ],
            serviceAccountTokens: [
                'existing-service-account-token',
                'existing-service-account-token',
            ],
        });

        await service.updateSettings(user, PROJECT_UUID, USER_UUID, {
            enabled: true,
        });

        expect(
            projectModel.setServiceAccountProjectAccess,
        ).toHaveBeenCalledWith(
            SERVICE_ACCOUNT_UUID,
            [
                {
                    projectUuid: PROJECT_UUID,
                    role: ProjectMemberRole.EDITOR,
                },
            ],
            { makeProjectScoped: true },
        );
    });

    it('deletes a new service account when its project grant cannot be created', async () => {
        const { projectModel, service, serviceAccountModel } = buildService();
        const grantError = new Error('project grant failed');
        projectModel.createServiceAccountProjectAccess.mockRejectedValue(
            grantError,
        );

        await expect(
            service.updateSettings(user, PROJECT_UUID, USER_UUID, {
                enabled: true,
            }),
        ).rejects.toBe(grantError);

        expect(serviceAccountModel.delete).toHaveBeenCalledWith(
            SERVICE_ACCOUNT_UUID,
        );
    });

    it('resolves the agent audience from the suggestions space when it exists', async () => {
        const { managedAgentClient, service } = buildService({
            suggestionsSpaces: [
                { uuid: 'space-uuid', inheritParentPermissions: false },
            ],
        });

        await service.updateSettings(user, PROJECT_UUID, USER_UUID, {
            enabled: true,
        });

        expect(managedAgentClient.syncAgent).toHaveBeenCalledWith(
            expect.objectContaining({
                policy: expect.objectContaining({ audience: 'admins' }),
            }),
        );
    });
});

describe('ManagedAgentService provider preflight', () => {
    it('rejects enabling on the AI SDK runtime when the org has no usable provider', async () => {
        const { managedAgentModel, schedulerClient, service } = buildService({
            runtime: 'ai-sdk',
        });
        vi.mocked(getModel).mockImplementation(() => {
            throw new Error('anthropic provider configuration is required');
        });

        await expect(
            service.updateSettings(user, PROJECT_UUID, USER_UUID, {
                enabled: true,
            }),
        ).rejects.toThrow(
            /Autopilot needs an AI provider before it can run\. anthropic provider configuration is required\./,
        );

        expect(managedAgentModel.upsertSettings).not.toHaveBeenCalled();
        expect(
            schedulerClient.scheduleManagedAgentHeartbeat,
        ).not.toHaveBeenCalled();
    });

    it('resolves the org default model when enabling on the AI SDK runtime', async () => {
        const { service } = buildService({
            runtime: 'ai-sdk',
            defaultModelConfig: {
                modelProvider: 'openai',
                modelName: 'gpt-5',
            },
        });

        await service.updateSettings(user, PROJECT_UUID, USER_UUID, {
            enabled: true,
        });

        expect(getModel).toHaveBeenCalledWith(copilotConfig, {
            enableReasoning: true,
            provider: 'openai',
            modelName: 'gpt-5',
        });
    });

    it('falls back to the provider default when the org default names an unknown provider', async () => {
        const { service } = buildService({
            runtime: 'ai-sdk',
            defaultModelConfig: {
                modelProvider: 'not-a-provider',
                modelName: 'whatever',
            },
        });

        await service.updateSettings(user, PROJECT_UUID, USER_UUID, {
            enabled: true,
        });

        expect(getModel).toHaveBeenCalledWith(copilotConfig, {
            enableReasoning: true,
            provider: undefined,
            modelName: undefined,
        });
    });

    it('does not preflight the provider on the managed-agents runtime', async () => {
        const { aiOrganizationSettingsService, service } = buildService();

        await service.updateSettings(user, PROJECT_UUID, USER_UUID, {
            enabled: true,
        });

        expect(getModel).not.toHaveBeenCalled();
        expect(
            aiOrganizationSettingsService.getDefaultModelConfig,
        ).not.toHaveBeenCalled();
    });
});
