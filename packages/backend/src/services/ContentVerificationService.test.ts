import { Ability } from '@casl/ability';
import {
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

const mockVerifiedItems: VerifiedContentListItem[] = [
    {
        uuid: 'cv-uuid-1',
        contentType: ContentType.CHART,
        contentUuid: 'chart-uuid',
        name: 'Test Chart',
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
    getSummary: jest.fn(async () => projectSummary),
};

const contentVerificationModel = {
    getAllForProject: jest.fn(async () => mockVerifiedItems),
};

describe('ContentVerificationService', () => {
    const service = new ContentVerificationService({
        contentVerificationModel:
            contentVerificationModel as unknown as ContentVerificationModel,
        projectModel: projectModel as unknown as ProjectModel,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('listVerifiedContent', () => {
        it('should throw ForbiddenError when user lacks manage:ContentVerification', async () => {
            await expect(
                service.listVerifiedContent(editorUser, 'project-uuid'),
            ).rejects.toThrow(ForbiddenError);

            expect(
                contentVerificationModel.getAllForProject,
            ).not.toHaveBeenCalled();
        });

        it('should return verified content when user is admin', async () => {
            const result = await service.listVerifiedContent(
                adminUser,
                'project-uuid',
            );

            expect(result).toEqual(mockVerifiedItems);
            expect(
                contentVerificationModel.getAllForProject,
            ).toHaveBeenCalledWith('project-uuid');
        });
    });
});
