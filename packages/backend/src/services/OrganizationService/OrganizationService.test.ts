import { Ability } from '@casl/ability';
import {
    LightdashInstallType,
    OrganizationMemberRole,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { buildAccount } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { GroupsModel } from '../../models/GroupsModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { OrganizationAllowedEmailDomainsModel } from '../../models/OrganizationAllowedEmailDomainsModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../models/UserModel';
import { OrganizationService } from './OrganizationService';
import { organization, user } from './OrganizationService.mock';

const projectModel = {
    hasProjects: jest.fn(async () => true),
    getProjectGroupAccesses: jest.fn(),
};
const organizationModel = {
    get: jest.fn(async () => organization),
};
const organizationMemberProfileModel = {
    getOrganizationMembersAndGroups: jest.fn(),
};

describe('organization service', () => {
    const organizationService = new OrganizationService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        organizationModel: organizationModel as unknown as OrganizationModel,
        projectModel: projectModel as unknown as ProjectModel,
        onboardingModel: {} as OnboardingModel,
        organizationMemberProfileModel:
            organizationMemberProfileModel as unknown as OrganizationMemberProfileModel,
        userModel: {} as UserModel,
        organizationAllowedEmailDomainsModel:
            {} as OrganizationAllowedEmailDomainsModel,
        groupsModel: {} as GroupsModel,
        featureFlagModel: {} as FeatureFlagModel,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    beforeEach(() => {
        process.env = {
            LIGHTDASH_INSTALL_TYPE: LightdashInstallType.UNKNOWN,
        };
    });

    it('Should return needsProject false if there are projects in DB', async () => {
        const account = buildAccount({ accountType: 'session' });
        expect(await organizationService.get(account)).toEqual({
            ...organization,
            needsProject: false,
        });
    });
    it('Should return needsProject true if there are no projects in DB', async () => {
        const account = buildAccount({ accountType: 'session' });
        (projectModel.hasProjects as jest.Mock).mockImplementationOnce(
            async () => false,
        );
        expect(await organizationService.get(account)).toEqual({
            ...organization,
            needsProject: true,
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
