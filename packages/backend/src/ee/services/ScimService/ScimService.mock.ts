import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { EmailModel } from '../../../models/EmailModel';
import { GroupsModel } from '../../../models/GroupsModel';
import { OrganizationMemberProfileModel } from '../../../models/OrganizationMemberProfileModel';
import { RolesModel } from '../../../models/RolesModel';
import { UserModel } from '../../../models/UserModel';
import { CommercialFeatureFlagModel } from '../../models/CommercialFeatureFlagModel';
import { ServiceAccountModel } from '../../models/ServiceAccountModel';
import { ScimService } from './ScimService';

// Mock user for testing
export const mockUser: OrganizationMemberProfile = {
    userUuid: 'test-uuid',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    isActive: true,
    role: OrganizationMemberRole.MEMBER,
    roleUuid: undefined,
    userCreatedAt: new Date(),
    userUpdatedAt: new Date(),
    organizationUuid: 'org-uuid',
};

// Mock organization member profile model
const organizationMemberProfileModelMock = {
    getOrganizationMemberByUuid: jest.fn().mockResolvedValue(mockUser),
    updateOrganizationMember: jest.fn().mockResolvedValue(mockUser),
    createOrganizationMembershipByUuid: jest.fn().mockResolvedValue(mockUser),
} as unknown as OrganizationMemberProfileModel;

// Mock user model
const userModelMock = {
    createUser: jest.fn().mockResolvedValue({
        userId: 1,
        userUuid: mockUser.userUuid,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        email: mockUser.email,
        isActive: mockUser.isActive,
        organizationUuid: mockUser.organizationUuid,
    }),
    updateUser: jest.fn().mockResolvedValue({
        userId: 1,
        userUuid: mockUser.userUuid,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        email: mockUser.email,
        isActive: mockUser.isActive,
        organizationUuid: mockUser.organizationUuid,
    }),
    getUserDetailsByUuid: jest.fn().mockResolvedValue(mockUser),
} as unknown as UserModel;

// Mock analytics
const analyticsMock = {
    track: jest.fn(),
} as unknown as LightdashAnalytics;

// Mock email model
const emailModelMock = {
    verifyUserEmailIfExists: jest.fn().mockResolvedValue(undefined),
} as unknown as EmailModel;

export const ScimServiceArgumentsMock: ConstructorParameters<
    typeof ScimService
>[0] = {
    lightdashConfig: lightdashConfigMock,
    organizationMemberProfileModel: organizationMemberProfileModelMock,
    userModel: userModelMock,
    emailModel: emailModelMock,
    analytics: analyticsMock,
    groupsModel: {
        removeUserFromAllGroups: jest.fn().mockResolvedValue(2),
    } as unknown as GroupsModel,
    serviceAccountModel: {} as ServiceAccountModel,
    commercialFeatureFlagModel: {} as CommercialFeatureFlagModel,
    rolesModel: {
        removeUserProjectAccess: jest.fn().mockResolvedValue(undefined),
        removeUserAccessFromAllProjects: jest.fn().mockResolvedValue(3),
    } as unknown as RolesModel,
};
