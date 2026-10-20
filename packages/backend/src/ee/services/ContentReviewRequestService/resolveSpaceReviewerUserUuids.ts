import { SpaceMemberRole } from '@lightdash/common';
import { type DirectAccessModel } from '../../../models/DirectAccessModel';
import { type SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';

type ResolveSpaceReviewerUserUuidsArgs = {
    spacePermissionService: SpacePermissionService;
    directAccessModel: DirectAccessModel;
    organizationUuid: string;
    projectUuid: string;
    targetSpaceUuid: string;
    requesterUuid: string;
};

/**
 * Editors and admins of the target space who can receive a direct-access
 * grant. The space access list includes every org and project admin, among
 * them inactive service-account users and users with no project access path;
 * granting those would fail the whole request, so they are not reviewers.
 */
export const resolveSpaceReviewerUserUuids = async ({
    spacePermissionService,
    directAccessModel,
    organizationUuid,
    projectUuid,
    targetSpaceUuid,
    requesterUuid,
}: ResolveSpaceReviewerUserUuidsArgs): Promise<string[]> => {
    const [{ data: access }, eligibleUsers] = await Promise.all([
        spacePermissionService.getPaginatedSpaceAccess(targetSpaceUuid, {}),
        directAccessModel.listUsers({ organizationUuid, projectUuid }),
    ]);
    const eligibleUserUuids = new Set(
        eligibleUsers.map((user) => user.userUuid),
    );
    return [
        ...new Set(
            access
                .filter(
                    (share) =>
                        share.userUuid !== requesterUuid &&
                        (share.role === SpaceMemberRole.EDITOR ||
                            share.role === SpaceMemberRole.ADMIN) &&
                        eligibleUserUuids.has(share.userUuid),
                )
                .map((share) => share.userUuid),
        ),
    ];
};
