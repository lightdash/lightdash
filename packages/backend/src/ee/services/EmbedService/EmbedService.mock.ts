import { Ability } from '@casl/ability';
import {
    OrganizationMemberRole,
    PossibleAbilities,
    SessionAccount,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationModel } from '../../../models/OrganizationModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SavedSqlModel } from '../../../models/SavedSqlModel';
import { UserAttributesModel } from '../../../models/UserAttributesModel';
import { UserModel } from '../../../models/UserModel';
import { AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { PermissionsService } from '../../../services/PermissionsService/PermissionsService';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { EmbedModel } from '../../models/EmbedModel';
import { EmbedService } from './EmbedService';

export const mockProjectUuid = 'project-123';
export const mockOrganizationUuid = 'org-456';
export const mockUserUuid = 'user-789';

// Mock account with permission to update projects
export const mockAccountWithPermission: SessionAccount = {
    organization: {
        organizationUuid: mockOrganizationUuid,
        name: 'Test Org',
        createdAt: new Date(),
    },
    authentication: {
        type: 'session',
        source: 'mock-session',
    },
    user: {
        type: 'registered',
        id: mockUserUuid,
        userUuid: mockUserUuid,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
        timezone: null,
        isSetupComplete: true,
        userId: 1,
        role: OrganizationMemberRole.ADMIN,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        abilityRules: [],
        ability: new Ability<PossibleAbilities>([
            { subject: 'Project', action: ['update', 'view'] },
        ]),
    },
    isAuthenticated: vi.fn().mockReturnValue(true),
    isRegisteredUser: vi.fn().mockReturnValue(true),
    isAnonymousUser: vi.fn().mockReturnValue(false),
    isSessionUser: vi.fn().mockReturnValue(true),
    isJwtUser: vi.fn().mockReturnValue(false),
    isServiceAccount: vi.fn().mockReturnValue(false),
    isPatUser: vi.fn().mockReturnValue(false),
    isOauthUser: vi.fn().mockReturnValue(false),
};

// Mock account without permission
export const mockAccountWithoutPermission: SessionAccount = {
    ...mockAccountWithPermission,
    user: {
        ...mockAccountWithPermission.user,
        role: OrganizationMemberRole.VIEWER,
        ability: new Ability<PossibleAbilities>([]),
    },
};

// Only mock what updateConfig actually uses
const projectModelMock = {
    getSummary: vi.fn().mockResolvedValue({
        projectUuid: mockProjectUuid,
        organizationUuid: mockOrganizationUuid,
        name: 'Test Project',
    }),
} as unknown as ProjectModel;

const featureFlagModelMock = {
    get: vi.fn().mockResolvedValue({ enabled: true }),
} as unknown as FeatureFlagModel;

const organizationModelMock = {
    get: vi.fn().mockResolvedValue({
        organizationUuid: mockOrganizationUuid,
        name: 'Test Org',
    }),
} as unknown as OrganizationModel;

const embedModelMock = {
    updateConfig: vi.fn().mockResolvedValue(undefined),
} as unknown as EmbedModel;

// Constructor dependencies - minimal mocks since updateConfig doesn't use them
export const EmbedServiceArgumentsMock: ConstructorParameters<
    typeof EmbedService
>[0] = {
    lightdashConfig: lightdashConfigMock,
    analytics: {} as LightdashAnalytics,
    encryptionUtil: {} as EncryptionUtil,
    embedModel: embedModelMock,
    dashboardModel: {} as DashboardModel,
    savedChartModel: {} as SavedChartModel,
    savedSqlModel: {} as SavedSqlModel,
    projectModel: projectModelMock,
    userAttributesModel: {} as UserAttributesModel,
    userModel: {} as UserModel,
    projectService: {} as ProjectService,
    spacePermissionService: {} as SpacePermissionService,
    asyncQueryService: {} as AsyncQueryService,
    permissionsService: {} as PermissionsService,
    featureFlagModel: featureFlagModelMock,
    organizationModel: organizationModelMock,
};
