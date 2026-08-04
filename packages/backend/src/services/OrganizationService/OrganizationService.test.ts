import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    LightdashInstallType,
    OrganizationMemberRole,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { buildAccount } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import Logger from '../../logging/logger';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { GroupsModel } from '../../models/GroupsModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { OrganizationAllowedEmailDomainsModel } from '../../models/OrganizationAllowedEmailDomainsModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { RolesModel } from '../../models/RolesModel';
import { UserModel } from '../../models/UserModel';
import {
    OrganizationService,
    type OrganizationServiceArguments,
} from './OrganizationService';
import { organization, user } from './OrganizationService.mock';

vi.mock('@sentry/node', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@sentry/node')>();
    return {
        ...actual,
        captureException: vi.fn(),
    };
});

const projectModel = {
    hasProjects: vi.fn(async () => true),
    getProjectGroupAccesses: vi.fn(),
};
const organizationModel = {
    get: vi.fn(async () => organization),
    create: vi.fn<OrganizationModel['create']>(async () => organization),
    hasOrgs: vi.fn<OrganizationModel['hasOrgs']>(async () => false),
};
const userModel = {
    hasUsers: vi.fn<UserModel['hasUsers']>(async () => false),
    joinOrg: vi.fn<UserModel['joinOrg']>(async () => user),
    findSessionUserAndOrgByUuid: vi.fn<
        UserModel['findSessionUserAndOrgByUuid']
    >(async () => user),
};
const featureFlagModel = {
    get: vi.fn<FeatureFlagModel['get']>(async ({ featureFlagId }) => ({
        id: featureFlagId,
        enabled: true,
    })),
};
vi.spyOn(analyticsMock, 'track');
const organizationMemberProfileModel = {
    getOrganizationMembersAndGroups: vi.fn(),
    getOrganizationAdmins: vi.fn(),
    updateOrganizationMember: vi.fn(),
};
const rolesModel = {
    getRoleWithScopesByUuid: vi.fn(),
};

describe('organization service', () => {
    const buildOrganizationService = (
        onOrganizationCreated?: OrganizationServiceArguments['onOrganizationCreated'],
    ) =>
        new OrganizationService({
            lightdashConfig: lightdashConfigMock,
            analytics: analyticsMock,
            organizationModel:
                organizationModel as unknown as OrganizationModel,
            projectModel: projectModel as unknown as ProjectModel,
            onboardingModel: {} as OnboardingModel,
            organizationMemberProfileModel:
                organizationMemberProfileModel as unknown as OrganizationMemberProfileModel,
            userModel: userModel as unknown as UserModel,
            organizationAllowedEmailDomainsModel:
                {} as OrganizationAllowedEmailDomainsModel,
            groupsModel: {} as GroupsModel,
            featureFlagModel: featureFlagModel as unknown as FeatureFlagModel,
            rolesModel: rolesModel as unknown as RolesModel,
            onOrganizationCreated,
        });
    const organizationService = buildOrganizationService();

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('updateMember', () => {
        it('rejects assigning a system role above a custom-role caller', async () => {
            const limitedAbility = new Ability<PossibleAbilities>([
                {
                    action: 'update',
                    subject: 'OrganizationMemberProfile',
                    conditions: {
                        organizationUuid: organization.organizationUuid,
                    },
                },
            ]);
            rolesModel.getRoleWithScopesByUuid.mockResolvedValue({
                roleUuid: 'limited-org-manager-role',
                organizationUuid: organization.organizationUuid,
                level: 'organization',
                scopes: ['manage:Organization'],
            });
            organizationMemberProfileModel.getOrganizationAdmins.mockResolvedValue(
                [{ userUuid: 'target-user' }, { userUuid: 'remaining-admin' }],
            );

            await expect(
                organizationService.updateMember(
                    {
                        ...user,
                        role: OrganizationMemberRole.MEMBER,
                        roleUuid: 'limited-org-manager-role',
                        ability: limitedAbility,
                    },
                    'target-user',
                    { role: OrganizationMemberRole.ADMIN },
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(
                organizationMemberProfileModel.updateOrganizationMember,
            ).not.toHaveBeenCalled();
        });
    });

    beforeEach(() => {
        process.env = {
            LIGHTDASH_INSTALL_TYPE: LightdashInstallType.UNKNOWN,
        };
    });

    it('tracks the onboarding flow when creating an organization', async () => {
        await organizationService.createAndJoinOrg(
            { ...user, organizationUuid: undefined },
            { name: 'Organization' },
        );

        expect(analyticsMock.track).toHaveBeenCalledWith({
            event: 'organization.created',
            userId: user.userUuid,
            properties: {
                type: 'self-hosted',
                organizationId: organization.organizationUuid,
                organizationName: organization.name,
                onboardingFlow: 'new',
            },
        });
    });

    it('awaits the organization-created hook', async () => {
        let resolveHook = () => {};
        const hookPending = new Promise<void>((resolve) => {
            resolveHook = resolve;
        });
        const onOrganizationCreated = vi.fn<
            NonNullable<OrganizationServiceArguments['onOrganizationCreated']>
        >(async () => hookPending);
        const service = buildOrganizationService(onOrganizationCreated);
        let completed = false;

        const creation = service
            .createAndJoinOrg(
                { ...user, organizationUuid: undefined },
                { name: 'Organization' },
            )
            .then(() => {
                completed = true;
            });

        await vi.waitFor(() => {
            expect(onOrganizationCreated).toHaveBeenCalledExactlyOnceWith({
                user,
                organizationUuid: organization.organizationUuid,
            });
        });
        expect(completed).toBe(false);

        resolveHook();
        await creation;

        expect(completed).toBe(true);
    });

    it('survives an organization-created hook failure', async () => {
        const error = new Error('Hook failed');
        const errorSpy = vi
            .spyOn(Logger, 'error')
            .mockImplementation(() => Logger);
        const onOrganizationCreated = vi.fn<
            NonNullable<OrganizationServiceArguments['onOrganizationCreated']>
        >(async () => {
            throw error;
        });
        const service = buildOrganizationService(onOrganizationCreated);

        await expect(
            service.createAndJoinOrg(
                { ...user, organizationUuid: undefined },
                { name: 'Organization' },
            ),
        ).resolves.toBeUndefined();

        expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error);
        expect(errorSpy).toHaveBeenCalledOnce();
        expect(analyticsMock.track).toHaveBeenCalledWith({
            userId: user.userUuid,
            event: 'user.joined_organization',
            properties: {
                organizationId: organization.organizationUuid,
                role: OrganizationMemberRole.ADMIN,
                projectIds: [],
            },
        });
    });

    it('Should return needsProject false if there are projects in DB', async () => {
        const account = buildAccount({ accountType: 'session' });
        expect(await organizationService.get(account)).toEqual({
            ...organization,
            needsProject: false,
            // Default account is a developer (not an org admin), so the pgwire
            // connection details are withheld — only `enabled` is exposed.
            pgWire: {
                enabled: false,
                tlsRequired: true,
                host: null,
                port: null,
            },
        });
    });
    it('Should return needsProject true if there are no projects in DB', async () => {
        const account = buildAccount({ accountType: 'session' });
        (
            projectModel.hasProjects as import('vitest').Mock
        ).mockImplementationOnce(async () => false);
        expect(await organizationService.get(account)).toEqual({
            ...organization,
            needsProject: true,
            pgWire: {
                enabled: false,
                tlsRequired: true,
                host: null,
                port: null,
            },
        });
    });

    it('Should expose pgwire connection details to org admins', async () => {
        const account = buildAccount({ accountType: 'session' });
        account.user.ability = new Ability<PossibleAbilities>([
            { subject: 'Organization', action: 'manage' },
        ]);
        const result = await organizationService.get(account);
        expect(result.pgWire).toEqual({
            enabled: false,
            tlsRequired: true,
            host: 'test.lightdash.cloud',
            port: null,
        });
    });

    it('Should withhold pgwire connection details from non-admins', async () => {
        const account = buildAccount({ accountType: 'session' });
        account.user.ability = new Ability<PossibleAbilities>([
            { subject: 'Organization', action: 'view' },
        ]);
        const result = await organizationService.get(account);
        expect(result.pgWire).toEqual({
            enabled: false,
            tlsRequired: true,
            host: null,
            port: null,
        });
    });

    it('getUsers falls back to the member org role when their group has a custom role', async () => {
        // Group access carries a custom-role UUID (coalesced from role_uuid),
        // which is not a system ProjectMemberRole and must not throw.
        const customRoleUuid = 'ac5ac86a-b8a6-47fa-9679-40520dcb6136';
        const projectUuid = 'project-1';
        const groupUuid = 'group-1';
        const adminUser: SessionUser = {
            ...user,
            ability: new Ability<PossibleAbilities>([
                { subject: 'OrganizationMemberProfile', action: 'manage' },
            ]),
        };
        const member = {
            userUuid: 'member-1',
            email: 'member@lightdash.com',
            firstName: 'Member',
            lastName: 'One',
            organizationUuid: organization.organizationUuid,
            role: OrganizationMemberRole.MEMBER,
            isActive: true,
            isInviteExpired: false,
            groups: [{ uuid: groupUuid, name: 'Custom group' }],
        };
        organizationMemberProfileModel.getOrganizationMembersAndGroups.mockResolvedValueOnce(
            { pagination: undefined, data: [member] },
        );
        projectModel.getProjectGroupAccesses.mockResolvedValueOnce([
            { projectUuid, groupUuid, role: customRoleUuid },
        ]);

        const result = await organizationService.getUsers(
            adminUser,
            10,
            undefined,
            undefined,
            projectUuid,
        );

        // Assert the behavioural outcome: a custom-role group must not throw and
        // the member keeps their own org role (no system-role conversion).
        expect(result.data).toHaveLength(1);
        expect(result.data[0].role).toBe(OrganizationMemberRole.MEMBER);
    });
});
