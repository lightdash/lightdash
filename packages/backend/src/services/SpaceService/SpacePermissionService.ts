import {
    resolveSpaceAccessForCasl,
    type SpaceAccessForCasl,
} from '@lightdash/common';
import { SpaceModel } from '../../models/SpaceModel';
import { SpacePermissionModel } from '../../models/SpacePermissionModel';
import { BaseService } from '../BaseService';

export class SpacePermissionService extends BaseService {
    constructor(
        private readonly spaceModel: SpaceModel,
        private readonly spacePermissionModel: SpacePermissionModel,
    ) {
        super();
    }

    /**
     * Gets the access context for a list of spaces, suitable for CASL authorization checks.
     * This method fetches permissions from direct space access, project memberships, and
     * organization memberships, then resolves them into a format suitable for CASL.
     *
     * @param spaceUuids - The UUIDs of the spaces to get access context for
     * @param filters - Optional filters to limit access data (e.g., for a specific user)
     * @returns A record mapping each space UUID to its resolved access context
     */
    async getAccessContext(
        spaceUuids: string[],
        filters?: { userUuid?: string },
    ): Promise<Record<string, SpaceAccessForCasl>> {
        // Map each space UUID to its root UUID (for nested spaces, access is based on root)
        const spaceToRoot = await Promise.all(
            spaceUuids.map(async (uuid) => {
                const { spaceRoot } =
                    await this.spaceModel.getSpaceRootFromCacheOrDB(uuid);
                return { spaceUuid: uuid, rootUuid: spaceRoot };
            }),
        );

        // Get unique root UUIDs to minimize queries
        const uniqueRootUuids = [
            ...new Set(spaceToRoot.map((s) => s.rootUuid)),
        ];

        // Fetch all access data in parallel
        const [directAccessBySpace, projectAccessBySpace, orgAccessBySpace] =
            await Promise.all([
                this.spacePermissionModel.getDirectSpaceAccess(
                    uniqueRootUuids,
                    filters,
                ),
                this.spacePermissionModel.getProjectSpaceAccess(
                    uniqueRootUuids,
                    filters,
                ),
                this.spacePermissionModel.getOrganizationSpaceAccess(
                    uniqueRootUuids,
                    filters,
                ),
            ]);

        // Resolve access for each original space UUID
        const result: Record<string, SpaceAccessForCasl> = {};

        for (const { spaceUuid, rootUuid } of spaceToRoot) {
            const directData = directAccessBySpace[rootUuid];
            const projectData = projectAccessBySpace[rootUuid];
            const orgData = orgAccessBySpace[rootUuid];

            // Determine isPrivate from whichever query returned actual data.
            // All queries for the same space should return the same isPrivate value.
            // SECURITY: If no query returned data, default to true (deny by default)
            const isPrivate =
                directData?.isPrivate ??
                projectData?.isPrivate ??
                orgData?.isPrivate ??
                true;

            result[spaceUuid] = resolveSpaceAccessForCasl({
                directAccess: directData?.access ?? [],
                projectAccess: projectData?.access ?? [],
                organizationAccess: orgData?.access ?? [],
                isPrivate,
            });
        }

        return result;
    }
}
