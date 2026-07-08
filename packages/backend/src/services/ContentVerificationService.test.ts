import { Ability } from '@casl/ability';
import {
    ChartKind,
    ContentType,
    ForbiddenError,
    OrganizationMemberRole,
    type PossibleAbilities,
    type SessionUser,
    type VerifiedContentListItem,
} from '@lightdash/common';
import { ContentVerificationModel } from '../models/ContentVerificationModel';
import { ProjectModel } from '../models/ProjectModel/ProjectModel';
import { ContentVerificationService } from './ContentVerificationService';
import { SpacePermissionService } from './SpaceService/SpacePermissionService';

const projectSummary = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
};

const adminUser: SessionUser = {
    userUuid: 'user-uuid',
    email: 'admin@test.com',
    firstName: 'Admin',
    lastName: 'User',
    organizationUuid: 'org-uuid',
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    timezone: null,
    isSetupComplete: true,
    userId: 1,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        { subject: 'ContentVerification', action: 'manage' },
    ]),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const editorUser: SessionUser = {
    ...adminUser,
    userUuid: 'editor-uuid',
    role: OrganizationMemberRole.EDITOR,
    ability: new Ability<PossibleAbilities>([
        { subject: 'Project', action: 'view' },
    ]),
};

const viewOnlyUser: SessionUser = {
    ...adminUser,
    userUuid: 'view-only-uuid',
    role: OrganizationMemberRole.INTERACTIVE_VIEWER,
    ability: new Ability<PossibleAbilities>([
        { subject: 'ContentVerification', action: 'view' },
    ]),
};

const mockVerifiedItems: VerifiedContentListItem[] = [
    {
        uuid: 'cv-uuid-1',
        contentType: ContentType.CHART,
        contentUuid: 'chart-uuid',
        name: 'Test Chart',
        description: null,
        chartKind: ChartKind.VERTICAL_BAR,
        exploreName: 'orders',
        views: 0,
        lastUpdatedAt: null,
        spaceUuid: 'space-uuid',
        spaceName: 'Test Space',
        verifiedBy: {
            userUuid: 'user-uuid',
            firstName: 'Admin',
            lastName: 'User',
        },
        verifiedAt: new Date(),
    },
];

const projectModel = {
    getSummary: vi.fn(async () => projectSummary),
};

const contentVerificationModel = {
    getAllForProject: vi.fn(async () => mockVerifiedItems),
};

const spacePermissionService = {
    getAccessibleSpaceUuids: vi.fn(async () => ['space-uuid']),
};

describe('ContentVerificationService', () => {
    const service = new ContentVerificationService({
        contentVerificationModel:
            contentVerificationModel as unknown as ContentVerificationModel,
        projectModel: projectModel as unknown as ProjectModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('listVerifiedContent', () => {
        it('should throw ForbiddenError when user lacks view:ContentVerification', async () => {
            await expect(
                service.listVerifiedContent(editorUser, 'project-uuid'),
            ).rejects.toThrow(ForbiddenError);

            expect(
                contentVerificationModel.getAllForProject,
            ).not.toHaveBeenCalled();
        });

        it('should return verified content when user has view:ContentVerification', async () => {
            const result = await service.listVerifiedContent(
                viewOnlyUser,
                'project-uuid',
            );

            expect(result).toEqual(mockVerifiedItems);
            expect(
                contentVerificationModel.getAllForProject,
            ).toHaveBeenCalledWith('project-uuid');
        });

        it('should return verified content the user can access', async () => {
            const result = await service.listVerifiedContent(
                adminUser,
                'project-uuid',
            );

            expect(result).toEqual(mockVerifiedItems);
            expect(
                contentVerificationModel.getAllForProject,
            ).toHaveBeenCalledWith('project-uuid');
            expect(
                spacePermissionService.getAccessibleSpaceUuids,
            ).toHaveBeenCalledWith('view', adminUser, ['space-uuid']);
        });

        it('should filter out verified content in spaces the user cannot access', async () => {
            spacePermissionService.getAccessibleSpaceUuids.mockResolvedValueOnce(
                [],
            );

            const result = await service.listVerifiedContent(
                adminUser,
                'project-uuid',
            );

            expect(result).toEqual([]);
        });
    });
});
