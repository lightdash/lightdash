import { subject } from '@casl/ability';
import {
    ForbiddenError,
    InvalidUser,
    isUserWithOrg,
    NotFoundError,
    type SessionUser,
    type UserContentOwnershipSummary,
} from '@lightdash/common';
import { ContentOwnershipModel } from '../models/ContentOwnershipModel';
import { UserModel } from '../models/UserModel';
import { BaseService } from './BaseService';

type ContentOwnershipServiceArguments = {
    contentOwnershipModel: ContentOwnershipModel;
    userModel: UserModel;
};

export class ContentOwnershipService extends BaseService {
    private readonly contentOwnershipModel: ContentOwnershipModel;

    private readonly userModel: UserModel;

    constructor({
        contentOwnershipModel,
        userModel,
    }: ContentOwnershipServiceArguments) {
        super({ serviceName: 'ContentOwnershipService' });
        this.contentOwnershipModel = contentOwnershipModel;
        this.userModel = userModel;
    }

    private async validateOrgMember(
        userUuid: string,
        organizationUuid: string,
    ): Promise<void> {
        try {
            await this.userModel.findSessionUserAndOrgByUuid(
                userUuid,
                organizationUuid,
            );
        } catch (error) {
            if (error instanceof InvalidUser) {
                throw new NotFoundError(
                    'User not found or not a member of the organization',
                );
            }
            throw error;
        }
    }

    private assertCanManageOwnedContent(
        user: SessionUser,
        organizationUuid: string,
        summary: UserContentOwnershipSummary,
    ): void {
        const auditedAbility = this.createAuditedAbility(user);
        const projectsWithoutPermission = summary.byProject
            .filter((project) =>
                auditedAbility.cannot(
                    'manage',
                    subject('Dashboard', {
                        organizationUuid,
                        projectUuid: project.projectUuid,
                        metadata: { projectName: project.projectName },
                    }),
                ),
            )
            .map((project) => project.projectName);

        if (projectsWithoutPermission.length > 0) {
            throw new ForbiddenError(
                `You do not have permission to manage content in: ${projectsWithoutPermission.join(
                    ', ',
                )}`,
            );
        }
    }

    async getUserContentOwnershipSummary(
        user: SessionUser,
        targetUserUuid: string,
    ): Promise<UserContentOwnershipSummary> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } = user;

        await this.validateOrgMember(targetUserUuid, organizationUuid);

        const summary =
            await this.contentOwnershipModel.getOwnershipSummaryByOwner(
                targetUserUuid,
            );

        this.assertCanManageOwnedContent(user, organizationUuid, summary);

        return summary;
    }

    async reassignUserContentOwnership(
        user: SessionUser,
        fromUserUuid: string,
        newOwnerUserUuid: string,
    ): Promise<{ reassignedCount: number }> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } = user;

        await this.validateOrgMember(fromUserUuid, organizationUuid);
        await this.validateOrgMember(newOwnerUserUuid, organizationUuid);

        const summary =
            await this.contentOwnershipModel.getOwnershipSummaryByOwner(
                fromUserUuid,
            );

        if (summary.totalCount === 0) {
            return { reassignedCount: 0 };
        }

        this.assertCanManageOwnedContent(user, organizationUuid, summary);

        const reassignedCount =
            await this.contentOwnershipModel.reassignUserOwnership(
                fromUserUuid,
                newOwnerUserUuid,
                user.userUuid,
            );

        this.logger.info(
            `Reassigned ${reassignedCount} content ownership rows from ${fromUserUuid} to ${newOwnerUserUuid}`,
            { organizationUuid, actorUuid: user.userUuid },
        );

        return { reassignedCount };
    }
}
