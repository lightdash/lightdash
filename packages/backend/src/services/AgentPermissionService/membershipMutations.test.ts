import { Ability } from '@casl/ability';
import {
    AgentCapability,
    OrganizationMemberRole,
    ProjectMemberRole,
    type PossibleAbilities,
} from '@lightdash/common';
import { fromApiKey, fromOauth } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { createOAuthScopedAbility } from '../../auth/oauthScopes/scopedAbility';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AgentCapabilityPolicyModel } from '../../models/AgentCapabilityPolicyModel';
import { GroupsService } from '../GroupService';
import { OrganizationService } from '../OrganizationService/OrganizationService';
import { ProjectService } from '../ProjectService/ProjectService';
import { agentSystemRoleMatrix } from './AgentPermissionService';

const setup = (mode: 'off' | 'legacy' | 'managed', oauth: boolean) => {
    const ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]);
    const user = {
        ...defaultSessionUser,
        role: OrganizationMemberRole.ADMIN,
        ability,
        abilityRules: ability.rules,
    };
    if (oauth)
        user.ability = createOAuthScopedAbility(ability, {
            mode: 'enforce',
            scopes: ['read', 'write'],
            clientId: 'agent',
            getRequest: () => ({ method: 'PATCH', routeTemplate: null }),
        });
    const account = oauth
        ? fromOauth(user, { accessToken: 'token', client: { id: 'agent' } })
        : fromApiKey(user, 'token');
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: mode !== 'off' }),
    };
    const featureFlagService = {
        get: vi.fn(async ({ featureFlagId }) => ({
            enabled: featureFlagId === 'agent-identity' ? mode !== 'off' : true,
        })),
    };
    vi.spyOn(AgentCapabilityPolicyModel.prototype, 'get').mockResolvedValue({
        mode: mode === 'off' ? 'managed' : mode,
        version: 1,
        allowedProjectUuids: null,
        systemRoleMatrix: agentSystemRoleMatrix([
            AgentCapability.Administration,
            AgentCapability.Publish,
        ]),
    });
    const projectModel = {
        getSummary: vi
            .fn()
            .mockResolvedValue({ organizationUuid: user.organizationUuid }),
        get: vi
            .fn()
            .mockResolvedValue({ organizationUuid: user.organizationUuid }),
        createProjectAccess: vi.fn(),
        updateProjectAccess: vi.fn(),
    };
    const group = {
        uuid: 'group',
        organizationUuid: user.organizationUuid,
        name: 'group',
        memberUuids: [],
    };
    const groupsModel = {
        getGroup: vi.fn().mockResolvedValue(group),
        getGroupWithMembers: vi.fn().mockResolvedValue(group),
        addGroupMembers: vi
            .fn()
            .mockResolvedValue([
                { groupUuid: 'group', userUuid: user.userUuid },
            ]),
        updateGroup: vi.fn().mockResolvedValue(group),
        upsertGroupAsCode: vi
            .fn()
            .mockResolvedValue({ action: 'NO_CHANGES', groupUuid: 'group' }),
        addProjectAccess: vi.fn().mockResolvedValue({}),
        updateProjectAccess: vi.fn().mockResolvedValue({}),
        removeGroupMember: vi.fn(),
        removeProjectAccess: vi.fn(),
        delete: vi.fn(),
    };
    const organizationMemberProfileModel = {
        updateOrganizationMember: vi.fn().mockResolvedValue({}),
    };
    const args = {
        lightdashConfig: lightdashConfigMock,
        featureFlagModel,
        featureFlagService,
        projectModel,
        groupsModel,
        organizationMemberProfileModel,
        rolesModel: {
            getOrganizationUserRoleSet: vi.fn().mockResolvedValue({
                systemRole: 'admin',
                customRoleUuids: [],
            }),
        },
        organizationModel: {
            get: vi.fn().mockResolvedValue({ name: 'organization' }),
        },
        analytics: { track: vi.fn() },
    };
    return {
        user,
        account,
        projectModel,
        groupsModel,
        organizationMemberProfileModel,
        projects: new ProjectService(
            args as unknown as ConstructorParameters<typeof ProjectService>[0],
        ),
        groups: new GroupsService(
            args as unknown as ConstructorParameters<typeof GroupsService>[0],
        ),
        organizations: new OrganizationService(
            args as unknown as ConstructorParameters<
                typeof OrganizationService
            >[0],
        ),
    };
};
afterEach(() => vi.restoreAllMocks());

describe.each([
    'project update',
    'project create',
    'group join',
    'group update',
    'groups as code',
    'group role create',
    'group role update',
    'org role',
] as const)('%s membership boundary', (operation) => {
    it.each(['managed', 'legacy', 'off', 'pat'] as const)(
        'handles %s actors before persistence',
        async (mode) => {
            const {
                user,
                account,
                projects,
                groups,
                organizations,
                projectModel,
                groupsModel,
                organizationMemberProfileModel,
            } = setup(mode === 'pat' ? 'managed' : mode, mode !== 'pat');
            const operations = {
                'project update': () =>
                    projects.updateProjectAccess(
                        user,
                        'project',
                        user.userUuid,
                        { role: ProjectMemberRole.DEVELOPER },
                    ),
                'project create': () =>
                    projects.createProjectAccess(user, 'project', {
                        email: user.email!,
                        role: ProjectMemberRole.DEVELOPER,
                        sendEmail: false,
                    }),
                'group join': () =>
                    groups.addGroupMember(user, {
                        groupUuid: 'group',
                        userUuid: user.userUuid,
                    }),
                'group update': () =>
                    groups.update(user, 'group', {
                        members: [{ userUuid: user.userUuid }],
                    }),
                'groups as code': () =>
                    groups.upsertGroupAsCode(account, user.organizationUuid!, {
                        version: 1,
                        name: 'group',
                        members: [user.email!],
                    }),
                'group role create': () =>
                    groups.addProjectAccess(user, {
                        groupUuid: 'group',
                        projectUuid: 'project',
                        role: ProjectMemberRole.DEVELOPER,
                    }),
                'group role update': () =>
                    groups.updateProjectAccess(
                        user,
                        { groupUuid: 'group', projectUuid: 'project' },
                        { role: ProjectMemberRole.DEVELOPER },
                    ),
                'org role': () =>
                    organizations.updateMember(user, user.userUuid, {
                        role: OrganizationMemberRole.DEVELOPER,
                    }),
            };
            const writers = {
                'project update': projectModel.updateProjectAccess,
                'project create': projectModel.createProjectAccess,
                'group join': groupsModel.addGroupMembers,
                'group update': groupsModel.updateGroup,
                'groups as code': groupsModel.upsertGroupAsCode,
                'group role create': groupsModel.addProjectAccess,
                'group role update': groupsModel.updateProjectAccess,
                'org role':
                    organizationMemberProfileModel.updateOrganizationMember,
            };
            if (mode === 'managed') {
                await expect(operations[operation]()).rejects.toMatchObject({
                    refusal: {
                        reason: 'agent_capability_denied',
                        capability: AgentCapability.Administration,
                        settingsUrl: '/generalSettings/agentIdentity',
                    },
                });
                expect(writers[operation]).not.toHaveBeenCalled();
            } else {
                await operations[operation]();
                expect(writers[operation]).toHaveBeenCalledOnce();
            }
        },
    );
});
