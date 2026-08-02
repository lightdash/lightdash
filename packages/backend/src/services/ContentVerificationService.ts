import { subject } from '@casl/ability';
import {
    ForbiddenError,
    type SessionUser,
    type VerifiedContentListItem,
} from '@lightdash/common';
import { CaslAuditWrapper } from '../logging/caslAuditWrapper';
import { logAuditEvent } from '../logging/winston';
import { ContentVerificationModel } from '../models/ContentVerificationModel';
import { ProjectModel } from '../models/ProjectModel/ProjectModel';
import { BaseService } from './BaseService';
import { SpacePermissionService } from './SpaceService/SpacePermissionService';

type ContentVerificationServiceArguments = {
    contentVerificationModel: ContentVerificationModel;
    projectModel: ProjectModel;
    spacePermissionService: SpacePermissionService;
};

export class ContentVerificationService extends BaseService {
    private readonly contentVerificationModel: ContentVerificationModel;

    private readonly projectModel: ProjectModel;

    private readonly spacePermissionService: SpacePermissionService;

    constructor({
        contentVerificationModel,
        projectModel,
        spacePermissionService,
    }: ContentVerificationServiceArguments) {
        super({ serviceName: 'ContentVerificationService' });
        this.contentVerificationModel = contentVerificationModel;
        this.projectModel = projectModel;
        this.spacePermissionService = spacePermissionService;
    }

    async listVerifiedContent(
        user: SessionUser,
        projectUuid: string,
    ): Promise<VerifiedContentListItem[]> {
        const project = await this.projectModel.getSummary(projectUuid);

        const auditedAbility = new CaslAuditWrapper(user.ability, user, {
            auditLogger: logAuditEvent,
        });

        if (
            auditedAbility.cannot(
                'view',
                subject('ContentVerification', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                    metadata: { projectUuid },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to view verified content',
            );
        }

        const items =
            await this.contentVerificationModel.getAllForProject(projectUuid);

        const accessibleSpaceUuids = new Set(
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                [...new Set(items.map((item) => item.spaceUuid))],
            ),
        );

        return items.filter((item) => accessibleSpaceUuids.has(item.spaceUuid));
    }
}
