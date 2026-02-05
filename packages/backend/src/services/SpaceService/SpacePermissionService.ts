import { SpaceShare } from '@lightdash/common';
import { SpaceModel } from '../../models/SpaceModel';
import { SpacePermissionModel } from '../../models/SpacePermissionModel';
import { BaseService } from '../BaseService';

type SpaceAccessForCasl = {
    organizationUuid: string;
    projectUuid: string;
    isPrivate: boolean;
    access: SpaceShare[];
};

// packages/common/src/authorization/spaceAccessResolver.ts
// type SpaceAccessContext = {
//     spaceIsPrivate: boolean;
//     directAccess: DirectSpaceAccess[];
//     userProjectRole?: ProjectMemberRole;
//     userOrgRole?: OrganizationMemberRole;
// };

export class SpacePermissionService extends BaseService {
    constructor(
        private readonly spaceModel: SpaceModel,
        private readonly spacePermissionModel: SpacePermissionModel,
    ) {
        super();
    }

    async getAccessContext(
        spaceUuids: string[],
        filters?: { userUuid: string },
    ): Promise<Record<string, SpaceAccessForCasl>> {
        const spaceRoots = await Promise.all(
            spaceUuids.map((uuid) =>
                this.spaceModel
                    .getSpaceRootFromCacheOrDB(uuid)
                    .then((r) => r.spaceRoot),
            ),
        );
        const directAccess =
            await this.spacePermissionModel.getDirectSpaceAccess(
                spaceRoots,
                filters,
            );
        const [projectAccess, organizationAccess] = await Promise.all([
            this.spacePermissionModel.getProjectSpaceAccess(
                spaceRoots,
                filters,
            ),
            this.spacePermissionModel.getOrganizationSpaceAccess(
                spaceRoots,
                filters,
            ),
        ]);

        throw new Error('Not fully implemented');
    }
}
