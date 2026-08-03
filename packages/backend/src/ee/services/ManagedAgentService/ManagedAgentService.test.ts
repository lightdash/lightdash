import { Ability } from '@casl/ability';
import {
    AnyType,
    ProjectMemberRole,
    ServiceAccountScope,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { ManagedAgentService } from './ManagedAgentService';

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
}: {
    projectGrants?: Array<{
        projectUuid: string;
        role: ProjectMemberRole;
        roleUuid: string | null;
    }>;
    serviceAccountScopes?: ServiceAccountScope[];
    serviceAccountTokens?: Array<string | null>;
} = {}) => {
    const managedAgentModel = {
        getSettings: vi.fn().mockResolvedValue(settings),
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
        getByToken: vi.fn().mockResolvedValue({
            uuid: SERVICE_ACCOUNT_UUID,
            description: `Autopilot (${PROJECT_UUID})`,
            scopes: serviceAccountScopes,
        }),
        update: vi.fn().mockResolvedValue(undefined),
    };
    const schedulerClient = {
        scheduleManagedAgentHeartbeat: vi.fn().mockResolvedValue(undefined),
    };

    const managedAgentClient = {
        syncAgent: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ManagedAgentService({
        lightdashConfig: {
            managedAgent: { schedule: '0 0 * * *' },
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
        spaceModel: {},
        spacePermissionService: {},
        userModel: {},
        featureFlagModel: {},
        serviceAccountModel,
        schedulerClient,
        slackClient: {},
        managedAgentClient,
    } as AnyType);

    return {
        managedAgentClient,
        managedAgentModel,
        projectModel,
        service,
        serviceAccountModel,
    };
};

describe('ManagedAgentService.updateSettings', () => {
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
});
