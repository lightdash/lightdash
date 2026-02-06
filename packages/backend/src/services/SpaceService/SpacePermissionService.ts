import {
    NotFoundError,
    resolveSpaceAccess,
    type SpaceAccess,
} from '@lightdash/common';
import { SpaceModel } from '../../models/SpaceModel';
import { SpacePermissionModel } from '../../models/SpacePermissionModel';
import { BaseService } from '../BaseService';

type SpaceAccessForCasl = {
    organizationUuid: string;
    projectUuid: string;
    isPrivate: boolean;
    access: SpaceAccess[];
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
        const uniqueSpaceUuids = [...new Set(spaceUuidsArg)];
        const uniqueRootSpaceUuids = [
            ...new Set(
                await Promise.all(
                    uniqueSpaceUuids.map((uuid) =>
                        this.spaceModel
                            .getSpaceRootFromCacheOrDB(uuid)
                            .then((r) => r.spaceRoot),
                    ),
                ),
            ),
        ];

        const [directAccessMap, projectAccessMap, orgAccessMap, spaceInfo] =
            await Promise.all([
                this.spacePermissionModel.getDirectSpaceAccess(
                    uniqueRootSpaceUuids,
                    filters,
                ),
                this.spacePermissionModel.getProjectSpaceAccess(
                    uniqueRootSpaceUuids,
                    filters,
                ),
                this.spacePermissionModel.getOrganizationSpaceAccess(
                    uniqueRootSpaceUuids,
                    filters,
                ),
                this.spacePermissionModel.getSpaceInfo(uniqueRootSpaceUuids),
            ]);

        const result: Record<string, SpaceAccessForCasl> = {};
        for (const spaceUuid of uniqueRootSpaceUuids) {
            const space = spaceInfo[spaceUuid];
            if (!space) {
                throw new NotFoundError(
                    'Space with uuid ${spaceUuid} not found',
                );
            }

            const { isPrivate, projectUuid, organizationUuid } =
                spaceInfo[spaceUuid];

            const access = resolveSpaceAccess({
                spaceUuid,
                isPrivate,
                directAccess: directAccessMap[spaceUuid] ?? [],
                projectAccess: projectAccessMap[spaceUuid] ?? [],
                organizationAccess: orgAccessMap[spaceUuid] ?? [],
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
