import { LightdashInstallType } from '@lightdash/common';
import {
    inviteLinkModel,
    onboardingModel,
    organizationAllowedEmailDomainsModel,
    organizationMemberProfileModel,
    organizationModel,
    projectModel,
    userModel,
} from '../../models/models';
import { OrganizationService } from './OrganizationService';
import { organization, user } from './OrganizationService.mock';

jest.mock('../../models/models', () => ({
    projectModel: {
        hasProjects: jest.fn(async () => true),
    },
    organizationModel: {
        get: jest.fn(async () => organization),
    },
    organizationAllowedEmailDomainsModel: {},
}));
describe('organization service', () => {
    const organizationService = new OrganizationService({
        organizationModel,
        projectModel,
        onboardingModel,
        inviteLinkModel,
        organizationMemberProfileModel,
        userModel,
        organizationAllowedEmailDomainsModel,
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
