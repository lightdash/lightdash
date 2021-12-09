import { LightdashMode } from 'common';
import { InviteLinkModel } from '../../models/InviteLinkModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../models/UserModel';
import { OrganizationService } from './OrganizationService';
import { orgUsers, user } from './OrganizationService.mock';

jest.mock('../../analytics/client', () => ({
    analytics: {
        track: jest.fn(),
    },
}));

jest.mock('../../config/lightdashConfig', () => ({
    lightdashConfig: {
        mode: LightdashMode.DEFAULT,
    },
}));

describe('DashboardService', () => {
    const service = new OrganizationService({
        organizationModel: {} as OrganizationModel,
        userModel: {
            getAllByOrganization: jest.fn(async () => orgUsers),
        } as any as UserModel,
        projectModel: {} as ProjectModel,
        onboardingModel: {} as OnboardingModel,
        inviteLinkModel: {
            hasActiveInvites: jest.fn(async () => true),
        } as any as InviteLinkModel,
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('hasInvitedUser', () => {
        test('should return true if there are no users but has an open invite', async () => {
            expect(await service.hasInvitedUser(user)).toEqual(true);
        });
    });
});
