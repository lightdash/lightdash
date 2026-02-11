import { subject } from '@casl/ability';
import {
    NotFoundError,
    resolveSpaceAccess,
    type AbilityAction,
    type SessionUser,
    type SpaceAccess,
} from '@lightdash/common';
import { SpaceModel } from '../../models/SpaceModel';
import { SpacePermissionModel } from '../../models/SpacePermissionModel';
import { BaseService } from '../BaseService';

type SpaceAccessContextForCasl = {
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

    /**
     * Checks if the actor has access to all the space uuids
     * @param action - The action to check permissions for
     * @param actor - The session user to check permissions for
     * @param spaceUuids - The space uuids to check permissions for
     * @returns The access context for the given space uuids
     */
    async can(
        action: AbilityAction,
        actor: Pick<SessionUser, 'ability' | 'userUuid'>,
        spaceUuids: string[] | string,
    ): Promise<boolean> {
        const spaceUuidsArray = Array.isArray(spaceUuids)
            ? spaceUuids
            : [spaceUuids];

        const accessContext = await this.getSpacesCaslContext(spaceUuidsArray, {
            userUuid: actor.userUuid,
        });

        return Object.values(accessContext).every((access) =>
            actor.ability.can(action, subject('Space', access)),
        );
    }

    /**
     * Gets the accessible space uuids for a given action and actor
     * @param action - The action to check permissions for
     * @param actor - The session user to check permissions for
     * @param spaceUuids - The space uuids to get the accessible space uuids for
     * @returns The accessible space uuids
     */
    async getAccessibleSpaceUuids(
        action: AbilityAction,
        actor: Pick<SessionUser, 'ability' | 'userUuid'>,
        spaceUuids: string[],
    ): Promise<string[]> {
        const accessContext = await this.getSpacesCaslContext(spaceUuids, {
            userUuid: actor.userUuid,
        });

        return Object.entries(accessContext)
            .filter(([_, access]) =>
                actor.ability.can(action, subject('Space', access)),
            )
            .map(([spaceUuid]) => spaceUuid);
    }

    /**
     * Gets the access context for a list of space uuids so we can check against CASL
     * @param spaceUuidsArg - The space uuids to get the access context for
     * @param filters - The filters to apply to the access context
     * @returns The access context for the given space uuids
     */
    private async getSpacesCaslContext(
        spaceUuidsArg: string[],
        filters?: { userUuid?: string },
    ): Promise<Record<string, SpaceAccessContextForCasl>> {
        const uniqueSpaceUuids = [...new Set(spaceUuidsArg)];

        // Getting the root space uuids since for nested spaces that's what is used
        const rootSpaceUuids = await Promise.all(
            uniqueSpaceUuids.map((uuid) =>
                this.spaceModel
                    .getSpaceRootFromCacheOrDB(uuid)
                    .then((r) => r.spaceRoot),
            ),
        );

        // Unique space uuids to root space uuids have the same index
        const spaceToRootSpaceTuples = rootSpaceUuids.map(
            (rootSpaceUuid, index) => [uniqueSpaceUuids[index], rootSpaceUuid],
        );

        const uniqueRootSpaceUuids = [...new Set(rootSpaceUuids)];
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

        const rootSpaceAccessContext: Record<
            string,
            SpaceAccessContextForCasl
        > = {};
        for (const rootSpaceUuid of uniqueRootSpaceUuids) {
            const space = spaceInfo[rootSpaceUuid];
            if (!space) {
                throw new NotFoundError(
                    `Space with uuid ${rootSpaceUuid} not found`,
                );
            }

            const { isPrivate, projectUuid, organizationUuid } =
                spaceInfo[rootSpaceUuid];

            const access = resolveSpaceAccess({
                spaceUuid: rootSpaceUuid,
                isPrivate,
                directAccess: directAccessMap[rootSpaceUuid] ?? [],
                projectAccess: projectAccessMap[rootSpaceUuid] ?? [],
                organizationAccess: orgAccessMap[rootSpaceUuid] ?? [],
            });

            rootSpaceAccessContext[rootSpaceUuid] = {
                organizationUuid,
                projectUuid,
                isPrivate,
                access,
            };
        }

        // Map back space access to space uuids
        return Object.fromEntries(
            spaceToRootSpaceTuples.map(([spaceUuid, rootSpaceUuid]) => [
                spaceUuid,
                rootSpaceAccessContext[rootSpaceUuid],
            ]),
        );
    }
}
