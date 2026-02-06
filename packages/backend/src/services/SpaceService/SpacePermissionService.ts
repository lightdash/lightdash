import { resolveSpaceAccess, type SpaceShare } from '@lightdash/common';
import { SpaceModel } from '../../models/SpaceModel';
import { SpacePermissionModel } from '../../models/SpacePermissionModel';
import { BaseService } from '../BaseService';

type SpaceAccessForCasl = {
    organizationUuid: string;
    projectUuid: string;
    isPrivate: boolean;
    access: SpaceShare[];
};

export class SpacePermissionService extends BaseService {
    constructor(
        private readonly spaceModel: SpaceModel,
        private readonly spacePermissionModel: SpacePermissionModel,
    ) {
        super();
    }

    async getAccessContext(
        spaceUuidsArg: string[],
        filters?: { userUuid?: string },
    ): Promise<Record<string, SpaceAccessForCasl>> {
        const spaceUuids = await Promise.all(
            spaceUuidsArg.map((uuid) =>
                this.spaceModel
                    .getSpaceRootFromCacheOrDB(uuid)
                    .then((r) => r.spaceRoot),
            ),
        );

        const [directAccessMap, projectAccessMap, orgAccessMap, spaceInfo] =
            await Promise.all([
                this.spacePermissionModel.getDirectSpaceAccess(
                    spaceUuids,
                    filters,
                ),
                this.spacePermissionModel.getProjectSpaceAccess(
                    spaceUuids,
                    filters,
                ),
                this.spacePermissionModel.getOrganizationSpaceAccess(
                    spaceUuids,
                    filters,
                ),
                this.spacePermissionModel.getSpaceInfo(spaceUuids),
            ]);

        const allUserUuids = new Set<string>();
        for (const entries of Object.values(directAccessMap))
            for (const e of entries) allUserUuids.add(e.userUuid);
        for (const entries of Object.values(projectAccessMap))
            for (const e of entries) allUserUuids.add(e.userUuid);
        for (const entries of Object.values(orgAccessMap))
            for (const e of entries) allUserUuids.add(e.userUuid);

        const userInfoMap = await this.spacePermissionModel.getUserInfo(
            Array.from(allUserUuids),
        );

        const result: Record<string, SpaceAccessForCasl> = {};
        for (const spaceUuid of spaceUuids) {
            const { isPrivate, projectUuid, organizationUuid } =
                spaceInfo[spaceUuid];
            const access = resolveSpaceAccess({
                spaceUuid,
                isPrivate,
                directAccess: directAccessMap[spaceUuid] ?? [],
                projectAccess: projectAccessMap[spaceUuid] ?? [],
                organizationAccess: orgAccessMap[spaceUuid] ?? [],
                userInfo: userInfoMap,
            });

            result[spaceUuid] = {
                organizationUuid,
                projectUuid,
                isPrivate,
                access,
            };
        }

        return result;
    }
}
