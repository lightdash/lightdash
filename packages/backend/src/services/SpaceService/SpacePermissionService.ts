import { subject } from '@casl/ability';
import {
    FeatureFlags,
    NotFoundError,
    resolveSpaceAccess,
    resolveSpaceAccessWithInheritance,
    type AbilityAction,
    type OrganizationSpaceAccess,
    type ProjectSpaceAccess,
    type SessionUser,
    type SpaceAccess,
    type SpaceAccessUserMetadata,
    type SpaceGroup,
} from '@lightdash/common';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SpacePermissionModel } from '../../models/SpacePermissionModel';
import { BaseService } from '../BaseService';

export type SpaceAccessContextForCasl = {
    organizationUuid: string;
    projectUuid: string;
    isPrivate: boolean;
    access: SpaceAccess[];
};

export class SpacePermissionService extends BaseService {
    constructor(
        private readonly featureFlagModel: FeatureFlagModel,
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
     * Returns the CASL context for a space (organizationUuid, projectUuid, isPrivate, access)
     * without performing any permission checks. Callers use this to build their own
     * `subject(...)` checks when the resource type is not Space.
     */
    async getSpaceAccessContext(
        userUuid: string,
        spaceUuid: string,
    ): Promise<SpaceAccessContextForCasl> {
        const accessContext = await this.getSpacesCaslContext([spaceUuid], {
            userUuid,
        });
        const ctx = accessContext[spaceUuid];
        if (!ctx) {
            throw new NotFoundError(
                `Couldn't find access context for space ${spaceUuid}`,
            );
        }
        return ctx;
    }

    /**
     * Gets the access context for a list of space uuids
     * @param userUuid - The user uuid to get the access context for
     * @param spaceUuids - The space uuids to get the access context for
     * @returns The access context for the given space uuids
     */
    async getSpacesAccessContext(
        userUuid: string,
        spaceUuids: string[],
    ): Promise<Record<string, SpaceAccessContextForCasl>> {
        return this.getSpacesCaslContext(spaceUuids, { userUuid });
    }

    /**
     * Returns the CASL context for a space with ALL users' resolved access
     * (not filtered to a single user). Used for access propagation and
     * building SpaceShare[] for the share modal UI.
     */
    async getAllSpaceAccessContext(
        spaceUuid: string,
    ): Promise<SpaceAccessContextForCasl> {
        const accessContext = await this.getSpacesCaslContext([spaceUuid]);
        const ctx = accessContext[spaceUuid];
        if (!ctx) {
            throw new NotFoundError(
                `Couldn't find access context for space ${spaceUuid}`,
            );
        }
        return ctx;
    }

    /**
     * Gets the access context for a list of space uuids so we can check against CASL.
     *
     * Dispatches to the legacy (root-based) or chain-aware (inheritance) strategy
     * based on the NestedSpacesPermissions feature flag.
     */
    private async getSpacesCaslContext(
        spaceUuidsArg: string[],
        filters?: { userUuid?: string },
    ): Promise<Record<string, SpaceAccessContextForCasl>> {
        // Feature flag: NestedSpacesPermissions
        // When ready to remove, delete getSpacesCaslContextLegacy and inline
        // getSpacesCaslContextWithInheritance here.
        const { enabled } = await this.featureFlagModel.get({
            featureFlagId: FeatureFlags.NestedSpacesPermissions,
        });
        if (enabled) {
            return this.getSpacesCaslContextWithInheritance(
                spaceUuidsArg,
                filters,
            );
        }
        return this.getSpacesCaslContextLegacy(spaceUuidsArg, filters);
    }

    /**
     * Legacy resolution: resolves every space to its root space, fetches access
     * for the root, and uses resolveSpaceAccess (flat, no chain awareness).
     *
     * Remove this method when NestedSpacesPermissions is fully rolled out.
     */
    private async getSpacesCaslContextLegacy(
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
                inheritsFromOrgOrProject: !isPrivate,
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

    /**
     * Chain-aware resolution: walks each space's inheritance chain (up to the
     * first ancestor with inherit_parent_permissions=false, or the root).
     * Direct access is aggregated from all spaces in the chain. Project/org
     * access is only included when the chain reaches a root space that inherits
     * from the project.
     *
     * Uses resolveSpaceAccessWithInheritance ("most permissive wins" across chain).
     */
    private async getSpacesCaslContextWithInheritance(
        spaceUuidsArg: string[],
        filters?: { userUuid?: string },
    ): Promise<Record<string, SpaceAccessContextForCasl>> {
        const uniqueSpaceUuids = [...new Set(spaceUuidsArg)];

        // Get inheritance chains for all spaces
        const chains = await Promise.all(
            uniqueSpaceUuids.map(async (uuid) => ({
                spaceUuid: uuid,
                ...(await this.spacePermissionModel.getInheritanceChain(uuid)),
            })),
        );

        // Collect all unique space UUIDs from all chains (for direct access queries)
        const allChainSpaceUuids = [
            ...new Set(
                chains.flatMap(({ chain }) =>
                    chain.map((item) => item.spaceUuid),
                ),
            ),
        ];

        // Collect root space UUIDs from ALL chains.
        // Project/org access is needed for every space — not just those that
        // inherit — because the resolver uses it to compute highestRole
        // (admin detection, etc.) even for private spaces with direct access.
        const allChainsRootSpaceUuids = [
            ...new Set(
                chains.map(({ chain }) => chain[chain.length - 1].spaceUuid),
            ),
        ];

        // Batch-fetch access data
        const [directAccessMap, projectAccessMap, orgAccessMap, spaceInfo] =
            await Promise.all([
                this.spacePermissionModel.getDirectSpaceAccess(
                    allChainSpaceUuids,
                    filters,
                ),
                allChainsRootSpaceUuids.length > 0
                    ? this.spacePermissionModel.getProjectSpaceAccess(
                          allChainsRootSpaceUuids,
                          filters,
                      )
                    : Promise.resolve(
                          {} as Record<string, ProjectSpaceAccess[]>,
                      ),
                allChainsRootSpaceUuids.length > 0
                    ? this.spacePermissionModel.getOrganizationSpaceAccess(
                          allChainsRootSpaceUuids,
                          filters,
                      )
                    : Promise.resolve(
                          {} as Record<string, OrganizationSpaceAccess[]>,
                      ),
                this.spacePermissionModel.getSpaceInfo(uniqueSpaceUuids),
            ]);

        // For each requested space, aggregate access from its chain
        const result: Record<string, SpaceAccessContextForCasl> = {};
        for (const { spaceUuid, chain, inheritsFromOrgOrProject } of chains) {
            const space = spaceInfo[spaceUuid];
            if (!space) {
                throw new NotFoundError(
                    `Space with uuid ${spaceUuid} not found`,
                );
            }

            // Build chain-ordered direct access (preserves leaf-to-root ordering)
            const chainDirectAccess = chain.map((item) => ({
                spaceUuid: item.spaceUuid,
                directAccess: directAccessMap[item.spaceUuid] ?? [],
            }));

            // Always pass project/org access — the resolver needs it for
            // highestRole computation (admin detection) even on non-inheriting
            // spaces. The inheritsFromOrgOrProject flag controls the fallback
            // path inside the resolver, not whether this data is available.
            const rootSpaceUuid = chain[chain.length - 1].spaceUuid;
            const projectAccess = projectAccessMap[rootSpaceUuid] ?? [];
            const orgAccess = orgAccessMap[rootSpaceUuid] ?? [];

            const access = resolveSpaceAccessWithInheritance({
                spaceUuid,
                inheritsFromOrgOrProject,
                chainDirectAccess,
                projectAccess,
                organizationAccess: orgAccess,
            });

            result[spaceUuid] = {
                organizationUuid: space.organizationUuid,
                projectUuid: space.projectUuid,
                isPrivate: !inheritsFromOrgOrProject,
                access,
            };
        }
        return result;
    }

    /**
     * Gets group access for a space.
     * Resolves to the root space for nested spaces.
     */
    async getGroupAccess(spaceUuid: string): Promise<SpaceGroup[]> {
        const { spaceRoot: rootSpaceUuid } =
            await this.spaceModel.getSpaceRootFromCacheOrDB(spaceUuid);
        return this.spacePermissionModel.getGroupAccess(rootSpaceUuid);
    }

    /**
     * Returns the UUID of the first root space the actor can view in the project.
     * Uses CASL-based permission checking via getAccessibleSpaceUuids.
     */
    async getFirstViewableSpaceUuid(
        actor: Pick<SessionUser, 'ability' | 'userUuid'>,
        projectUuid: string,
    ): Promise<string> {
        const allRootSpaceUuids =
            await this.spaceModel.getRootSpaceUuidsForProject(projectUuid);
        const accessible = await this.getAccessibleSpaceUuids(
            'view',
            actor,
            allRootSpaceUuids,
        );
        if (accessible.length === 0) {
            throw new NotFoundError(
                `No viewable space found for project ${projectUuid}`,
            );
        }
        return accessible[0];
    }

    /**
     * Returns the user UUIDs that have direct access to each space.
     * Used for populating the `access: string[]` field on SpaceSummary.
     * Does NOT filter by user — returns all directly-shared user UUIDs.
     */
    async getDirectAccessUserUuids(
        spaceUuids: string[],
    ): Promise<Record<string, string[]>> {
        if (spaceUuids.length === 0) return {};

        const uniqueSpaceUuids = [...new Set(spaceUuids)];

        // Getting the root space uuids since for nested spaces that's what is used
        const rootSpaceUuids = await Promise.all(
            uniqueSpaceUuids.map((uuid) =>
                this.spaceModel
                    .getSpaceRootFromCacheOrDB(uuid)
                    .then((r) => r.spaceRoot),
            ),
        );

        const spaceToRootSpaceTuples = rootSpaceUuids.map(
            (rootSpaceUuid, index) => [uniqueSpaceUuids[index], rootSpaceUuid],
        );

        const directAccessMap =
            await this.spacePermissionModel.getDirectSpaceAccess(
                rootSpaceUuids,
            );

        return Object.fromEntries(
            spaceToRootSpaceTuples.map(([spaceUuid, rootSpaceUuid]) => [
                spaceUuid,
                directAccessMap[rootSpaceUuid]?.map((e) => e.userUuid) ?? [],
            ]),
        );
    }

    async getUserMetadataByUuids(
        userUuids: string[],
    ): Promise<Record<string, SpaceAccessUserMetadata>> {
        return this.spacePermissionModel.getUserMetadataByUuids(userUuids);
    }
}
