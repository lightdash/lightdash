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
const userModel = {
    getAllByOrganization: jest.fn(async () => orgUsers),
} as any as UserModel;
const inviteLinkModel = {
    hasActiveInvites: jest.fn(async () => true),
} as any as InviteLinkModel;

describe('DashboardService', () => {
    const service = new OrganizationService({
        organizationModel: {} as OrganizationModel,
        userModel,
        projectModel: {} as ProjectModel,
        onboardingModel: {} as OnboardingModel,
        inviteLinkModel,
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('hasInvitedUser', () => {
        afterEach(() => {
            jest.clearAllMocks();
        });
        test('should return true if there are users and has an open invite', async () => {
            expect(await service.hasInvitedUser(user)).toEqual(true);
        });
        test('should return true if there are users and no open invite', async () => {
            (
                inviteLinkModel.hasActiveInvites as jest.Mock
            ).mockImplementationOnce(async () => false);
            expect(await service.hasInvitedUser(user)).toEqual(true);
        });
        test('should return true if there are no users and has an open invite', async () => {
            (
                userModel.getAllByOrganization as jest.Mock
            ).mockImplementationOnce(async () => []);
            expect(await service.hasInvitedUser(user)).toEqual(true);
        });
        test('should return false if there are no users and no open invite', async () => {
            (
                inviteLinkModel.hasActiveInvites as jest.Mock
            ).mockImplementationOnce(async () => false);
            (
                userModel.getAllByOrganization as jest.Mock
            ).mockImplementationOnce(async () => []);
            expect(await service.hasInvitedUser(user)).toEqual(false);
        });
    });
});
