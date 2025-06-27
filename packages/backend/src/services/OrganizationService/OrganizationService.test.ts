import { LightdashInstallType } from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ServiceAccountModel } from '../../ee/models/ServiceAccountModel';
import { PersonalAccessTokenModel } from '../../models/DashboardModel/PersonalAccessTokenModel';
import { EmailModel } from '../../models/EmailModel';
import { GroupsModel } from '../../models/GroupsModel';
import { InviteLinkModel } from '../../models/InviteLinkModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { OrganizationAllowedEmailDomainsModel } from '../../models/OrganizationAllowedEmailDomainsModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../models/UserModel';
import { ProjectService } from '../ProjectService/ProjectService';
import { OrganizationService } from './OrganizationService';
import { organization, user } from './OrganizationService.mock';

const projectModel = {
    hasProjects: jest.fn(async () => true),
};
const organizationModel = {
    get: jest.fn(async () => organization),
};

describe('organization service', () => {
    const organizationService = new OrganizationService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        organizationModel: organizationModel as unknown as OrganizationModel,
        projectModel: projectModel as unknown as ProjectModel,
        onboardingModel: {} as OnboardingModel,
        inviteLinkModel: {} as InviteLinkModel,
        organizationMemberProfileModel: {} as OrganizationMemberProfileModel,
        userModel: {} as UserModel,
        organizationAllowedEmailDomainsModel:
            {} as OrganizationAllowedEmailDomainsModel,
        groupsModel: {} as GroupsModel,
        personalAccessTokenModel: {} as PersonalAccessTokenModel,
        emailModel: {} as EmailModel,
        projectService: {} as ProjectService,
        serviceAccountModel: {} as ServiceAccountModel,
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
        expect(await organizationService.get(user)).toEqual({
            ...organization,
            needsProject: false,
        });
    });
    it('Should return needsProject true if there are no projects in DB', async () => {
        (projectModel.hasProjects as jest.Mock).mockImplementationOnce(
            async () => false,
        );
        expect(await organizationService.get(user)).toEqual({
            ...organization,
            needsProject: true,
        });
    });
});
