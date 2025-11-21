import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
    ProjectType,
    Role,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { EmailModel } from '../../../models/EmailModel';
import { GroupsModel } from '../../../models/GroupsModel';
import { OrganizationMemberProfileModel } from '../../../models/OrganizationMemberProfileModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
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

// Mock projects for testing
export const mockProjects = [
    {
        projectUuid: 'project-1-uuid',
        name: 'Analytics Project',
        type: ProjectType.DEFAULT,
        organizationUuid: 'org-uuid',
    },
    {
        projectUuid: 'project-2-uuid',
        name: 'Marketing Project',
        type: ProjectType.DEFAULT,
        organizationUuid: 'org-uuid',
    },
    {
        projectUuid: 'preview-project-uuid',
        name: 'Preview Project',
        type: ProjectType.PREVIEW,
        organizationUuid: 'org-uuid',
    },
];

// Mock custom roles for testing
export const mockCustomRoles: Role[] = [
    {
        roleUuid: 'custom-role-1-uuid',
        name: 'Data Analyst',
        description: 'Custom data analyst role',
        organizationUuid: 'org-uuid',
        ownerType: 'user',
        createdBy: 'test-user-uuid',
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        roleUuid: 'custom-role-2-uuid',
        name: 'Report Builder',
        description: 'Custom report builder role',
        organizationUuid: 'org-uuid',
        ownerType: 'user',
        createdBy: 'test-user-uuid',
        createdAt: new Date(),
        updatedAt: new Date(),
    },
];

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
    getUserProjectRoles: jest.fn().mockResolvedValue([]),
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
        getRolesByOrganizationUuid: jest
            .fn()
            .mockResolvedValue(mockCustomRoles),
        upsertSystemRoleProjectAccess: jest.fn().mockResolvedValue(undefined),
        upsertCustomRoleProjectAccess: jest.fn().mockResolvedValue(undefined),
        // New unified method used by ScimService to set org and project roles
        setUserOrgAndProjectRoles: jest.fn().mockResolvedValue(undefined),
        // Some code paths may still call this directly; keep a mock for safety
        upsertOrganizationUserRoleAssignment: jest
            .fn()
            .mockResolvedValue(undefined),
    } as unknown as RolesModel,
    projectModel: {
        getAllByOrganizationUuid: jest.fn().mockResolvedValue(mockProjects),
    } as unknown as ProjectModel,
};
