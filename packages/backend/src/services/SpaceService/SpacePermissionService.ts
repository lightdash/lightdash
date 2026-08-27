import { subject } from '@casl/ability';
import {
    assertUnreachable,
    getHighestSpaceRole,
    getOrganizationRoleForRoleSetSpaceAccess,
    getProjectRoleForRoleSetSpaceAccess,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    ProjectMemberRole,
    resolveSpaceAccess,
    SpaceMemberRole,
    type AbilityAction,
    type GrantSource,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type OrganizationSpaceAccess,
    type ProjectSpaceAccess,
    type SessionUser,
    type SpaceAccess,
    type SpaceAccessListFilters,
    type SpaceAccessUserMetadata,
    type SpaceGroup,
    type SpaceShare,
} from '@lightdash/common';
import { Knex } from 'knex';
import { type DashboardAccessModel } from '../../models/DashboardAccessModel';
import { type DirectAccess } from '../../models/directAccessModelUtils';
import { type SavedChartAccessModel } from '../../models/SavedChartAccessModel';
import { SpaceModel } from '../../models/SpaceModel';
import {
    SpacePermissionModel,
    type OrganizationSpaceAccessWithCustomRole,
    type ProjectSpaceAccessWithCustomRole,
} from '../../models/SpacePermissionModel';
import { BaseService } from '../BaseService';
import { type DirectAccessFeatureGate } from '../DirectAccess/DirectAccessFeatureGate';

export type SpaceAdmin = {
    userUuid: string;
    source: 'organization' | 'project';
};

export type SpaceAccessContextForCasl = {
    organizationUuid: string;
    projectUuid: string;
    inheritsFromOrgOrProject: boolean;
    access: SpaceAccess[];
    // Admins reach the space via CASL even when `resolveSpaceAccess` omits
    // them (private spaces with no direct entry). Surfaced for audit display.
    admins: SpaceAdmin[];
};

export type AccessTarget =
    | { type: 'space'; spaceUuid: string }
    | { type: 'dashboard'; dashboardUuid: string; spaceUuid: string }
    | {
          type: 'chart';
          chartUuid: string;
          dashboardUuid: string | null;
          spaceUuid: string;
      };

// A content type's direct-grant lookup (e.g. DashboardAccessModel.getUserAccess
// or SavedChartAccessModel.getUserAccess), pre-bound to the requesting user.
type GrantLookup = (
    resourceUuids: string[],
    opts: { organizationUuid: string; trx?: Knex },
) => Promise<Record<string, DirectAccess>>;

type DirectGrantTarget = {
    source: GrantSource;
    resourceUuid: string;
    resourceLabel: string;
    spaceUuid: string;
};

export type AccessContextForCasl = SpaceAccessContextForCasl & {
    /**
     * True when the requester has no space-derived access path (membership,
     * inheritance, or admin standing) and reaches the content only through
     * direct content grants.
     */
    directOnly: boolean;
};

export type AccessResult<T extends AccessTarget = AccessTarget> = {
    target: T;
    context: AccessContextForCasl | undefined;
};

/**
 * Correlates a space-target batch by spaceUuid. Only valid for space targets,
 * where the context is a pure function of the space — grant-aware targets can
 * carry different contexts within one space and must correlate per target.
 */
export const spaceContextsByUuid = (
    results: AccessResult<{ type: 'space'; spaceUuid: string }>[],
): Record<string, AccessContextForCasl | undefined> =>
    Object.fromEntries(
        results.map(({ target, context }) => [target.spaceUuid, context]),
    );

export class SpacePermissionService extends BaseService {
    private readonly spaceModel: SpaceModel;

    private readonly spacePermissionModel: SpacePermissionModel;

    private readonly dashboardAccessModel: DashboardAccessModel;

    private readonly savedChartAccessModel: SavedChartAccessModel;

    private readonly directAccessFeatureGate: DirectAccessFeatureGate;

    constructor({
        spaceModel,
        spacePermissionModel,
        dashboardAccessModel,
        savedChartAccessModel,
        directAccessFeatureGate,
    }: {
        spaceModel: SpaceModel;
        spacePermissionModel: SpacePermissionModel;
        dashboardAccessModel: DashboardAccessModel;
        savedChartAccessModel: SavedChartAccessModel;
        directAccessFeatureGate: DirectAccessFeatureGate;
    }) {
        super();
        this.spaceModel = spaceModel;
        this.spacePermissionModel = spacePermissionModel;
        this.dashboardAccessModel = dashboardAccessModel;
        this.savedChartAccessModel = savedChartAccessModel;
        this.directAccessFeatureGate = directAccessFeatureGate;
    }

    /**
     * Checks if the user has access to all the space uuids
     * @param action - The action to check permissions for
     * @param user - The session user to check permissions for
     * @param spaceUuids - The space uuids to check permissions for
     * @returns The access context for the given space uuids
     */
    async can(
        action: AbilityAction,
        user: SessionUser,
        spaceUuids: string[] | string,
        { trx }: { trx?: Knex } = {},
    ): Promise<boolean> {
        const spaceUuidsArray = Array.isArray(spaceUuids)
            ? spaceUuids
            : [spaceUuids];

        const accessContext = await this.getSpacesCaslContext(
            spaceUuidsArray,
            {
                userUuid: user.userUuid,
            },
            { trx },
        );

        const uniqueSpaceUuids = [...new Set(spaceUuidsArray)];
        if (
            uniqueSpaceUuids.some(
                (spaceUuid) => accessContext[spaceUuid] === undefined,
            )
        ) {
            return false;
        }

        const auditedAbility = this.createAuditedAbility(user);
        return uniqueSpaceUuids.every((spaceUuid) =>
            auditedAbility.can(
                action,
                subject('Space', accessContext[spaceUuid]),
            ),
        );
    }

    /**
     * Gets the accessible space uuids for a given action and user
     * @param action - The action to check permissions for
     * @param user - The session user to check permissions for
     * @param spaceUuids - The space uuids to get the accessible space uuids for
     * @returns The accessible space uuids
     */
    async getAccessibleSpaceUuids(
        action: AbilityAction,
        user: SessionUser,
        spaceUuids: string[],
    ): Promise<string[]> {
        const accessContext = await this.getSpacesCaslContext(spaceUuids, {
            userUuid: user.userUuid,
        });

        const auditedAbility = this.createAuditedAbility(user);
        const entries = Object.entries(accessContext);
        const accessResults = auditedAbility.canBulk(
            action,
            entries.map(([spaceUuid, access]) =>
                subject('Space', {
                    ...access,
                    metadata: { spaceUuid },
                }),
            ),
        );

        return entries
            .filter((_, index) => accessResults[index])
            .map(([spaceUuid]) => spaceUuid);
    }

    /** Returns persisted direct grants without inherited or expanded access. */
    async getRawDirectAccess(spaceUuids: string[]) {
        return this.spacePermissionModel.getRawDirectAccess(spaceUuids);
    }

    /**
     * Resolves effective access to one supported target. Space permissions are
     * always the baseline; direct content grants are added when applicable.
     *
     * THE BOUNDARY RULE. A direct grant on a dashboard authorizes operations
     * whose effect stays INSIDE that dashboard; anything that reads, moves, or
     * copies content BEYOND the dashboard requires real space access.
     *
     * This turns on one distinction:
     *   - A chart OWNED BY a dashboard (`saved_queries.dashboard_uuid` set,
     *     `space_id` null) inherits the dashboard's grants — sharing the
     *     dashboard shares its own charts.
     *   - A chart that merely LIVES IN A SPACE (`space_id` set) is governed by
     *     space access only — sharing a dashboard that references it grants
     *     nothing over it.
     * Why: the grant's scope is "you may work within this dashboard", so it
     * must never become a lever to reach a chart's private space or to relocate
     * content into a space the granter never saw.
     *
     * Mechanically: returns the space CASL context plus the requester's direct
     * dashboard grants appended as ordinary `access` rows tagged
     * `grantedVia: 'dashboard'`, so the existing elemMatch ability rules
     * interpret them with no dashboard-specific logic. Behind the direct-access
     * feature gate; with the flag off the result equals the plain space
     * context.
     *
     * Boundary-crossing operations pass a `space` target so content grants do
     * not count. A `chart` target routes through its owning dashboard when it
     * has one, otherwise through the saved chart's own direct grants.
     */
    async resolveAccess(
        userUuid: string,
        target: AccessTarget,
        { trx }: { trx?: Knex } = {},
    ): Promise<AccessContextForCasl> {
        const [result] = await this.resolveAccessTargets(userUuid, [target], {
            onMismatch: 'throw',
            trx,
        });
        const context = result?.context;
        if (context === undefined) {
            throw new NotFoundError(
                `Couldn't find access context for space ${target.spaceUuid}`,
            );
        }
        return context;
    }

    /**
     * Batched access resolution paired with each original target. Unlike the
     * strict single-target `resolveAccess` (which throws), missing spaces and
     * mismatched resource refs degrade to `undefined` or space-only access so
     * one doubtful target never fails an entire hot-path request. The two
     * entry points differ in that error posture, not just arity.
     *
     * All grant-bearing targets must belong to one organization (every caller
     * is project-scoped); a batch spanning organizations throws.
     */
    async resolveAccessBatch<T extends AccessTarget>(
        userUuid: string,
        targets: T[],
        { trx }: { trx?: Knex } = {},
    ): Promise<AccessResult<T>[]> {
        return this.resolveAccessTargets(userUuid, targets, {
            onMismatch: 'fallback',
            trx,
        });
    }

    private static getDirectGrantTarget(
        target: AccessTarget,
    ): DirectGrantTarget | undefined {
        switch (target.type) {
            case 'space':
                return undefined;
            case 'dashboard':
                return {
                    source: 'dashboard',
                    resourceUuid: target.dashboardUuid,
                    resourceLabel: 'Dashboard',
                    spaceUuid: target.spaceUuid,
                };
            case 'chart':
                return target.dashboardUuid
                    ? {
                          source: 'dashboard',
                          resourceUuid: target.dashboardUuid,
                          resourceLabel: 'Dashboard',
                          spaceUuid: target.spaceUuid,
                      }
                    : {
                          source: 'saved_chart',
                          resourceUuid: target.chartUuid,
                          resourceLabel: 'Saved chart',
                          spaceUuid: target.spaceUuid,
                      };
            default:
                return assertUnreachable(
                    target,
                    'Unsupported access target type',
                );
        }
    }

    private getGrantLookup(userUuid: string, source: GrantSource): GrantLookup {
        switch (source) {
            case 'dashboard':
                return (resourceUuids, opts) =>
                    this.dashboardAccessModel.getUserAccess(
                        resourceUuids,
                        userUuid,
                        opts,
                    );
            case 'saved_chart':
                return (resourceUuids, opts) =>
                    this.savedChartAccessModel.getUserAccess(
                        resourceUuids,
                        userUuid,
                        opts,
                    );
            default:
                return assertUnreachable(
                    source,
                    'Unsupported direct grant source',
                );
        }
    }

    private async resolveAccessTargets<T extends AccessTarget>(
        userUuid: string,
        targets: T[],
        {
            onMismatch,
            trx,
        }: {
            onMismatch: 'throw' | 'fallback';
            trx?: Knex;
        },
    ): Promise<AccessResult<T>[]> {
        if (targets.length === 0) {
            return [];
        }

        const uniqueSpaceUuids = [
            ...new Set(targets.map((target) => target.spaceUuid)),
        ];
        const spaceContexts = await this.getSpacesCaslContext(
            uniqueSpaceUuids,
            { userUuid },
            { trx },
        );
        const spaceOnly = (target: T): AccessContextForCasl | undefined => {
            const context = spaceContexts[target.spaceUuid];
            return context ? { ...context, directOnly: false } : undefined;
        };
        const resultFor = (
            target: T,
            context: AccessContextForCasl | undefined,
        ): AccessResult<T> => ({ target, context });
        const grantTargets = targets.flatMap((target) => {
            const spaceContext = spaceContexts[target.spaceUuid];
            const grantTarget =
                SpacePermissionService.getDirectGrantTarget(target);
            return grantTarget && spaceContext
                ? [
                      {
                          ...grantTarget,
                          organizationUuid: spaceContext.organizationUuid,
                      },
                  ]
                : [];
        });
        if (grantTargets.length === 0) {
            return targets.map((target) =>
                resultFor(target, spaceOnly(target)),
            );
        }

        // Every caller is project-scoped, so grant-bearing targets can only
        // ever belong to one organization. A batch that spans organizations is
        // a caller bug or a probing attempt — refuse it rather than service it.
        const organizationUuids = [
            ...new Set(grantTargets.map((target) => target.organizationUuid)),
        ];
        if (organizationUuids.length > 1) {
            throw new ParameterError(
                'Access targets must belong to a single organization',
            );
        }
        const [organizationUuid] = organizationUuids;
        const directAccessEnabled =
            await this.directAccessFeatureGate.isEnabledForUser({
                userUuid,
                organizationUuid,
            });
        if (!directAccessEnabled) {
            return targets.map((target) =>
                resultFor(target, spaceOnly(target)),
            );
        }

        const grantBatches = new Map<GrantSource, Set<string>>();
        grantTargets.forEach((target) => {
            const resourceUuids = grantBatches.get(target.source) ?? new Set();
            resourceUuids.add(target.resourceUuid);
            grantBatches.set(target.source, resourceUuids);
        });

        const grantResults = await Promise.all(
            [...grantBatches].map(async ([source, resourceUuids]) => ({
                source,
                grants: await this.getGrantLookup(userUuid, source)(
                    [...resourceUuids],
                    trx ? { organizationUuid, trx } : { organizationUuid },
                ),
            })),
        );
        const grantsBySource = new Map<
            GrantSource,
            Record<string, DirectAccess>
        >(grantResults.map(({ source, grants }) => [source, grants]));

        return targets.map((target) => {
            const spaceContext = spaceContexts[target.spaceUuid];
            const grantTarget =
                SpacePermissionService.getDirectGrantTarget(target);
            if (spaceContext === undefined || grantTarget === undefined) {
                return resultFor(target, spaceOnly(target));
            }
            const grant = grantsBySource.get(grantTarget.source)?.[
                grantTarget.resourceUuid
            ];
            if (grant === undefined) {
                return resultFor(target, spaceOnly(target));
            }
            const grantRoles = [
                ...(grant.userRole ? [grant.userRole] : []),
                ...grant.groupRoles,
            ];
            if (grantRoles.length === 0) {
                return resultFor(target, spaceOnly(target));
            }
            const isMismatched = grant.spaceUuid !== target.spaceUuid;
            if (isMismatched && onMismatch === 'throw') {
                throw new ParameterError(
                    `${grantTarget.resourceLabel} ${grantTarget.resourceUuid} does not belong to space ${target.spaceUuid}`,
                );
            }
            if (isMismatched) {
                return resultFor(target, spaceOnly(target));
            }
            return resultFor(
                target,
                SpacePermissionService.withGrantAccess(
                    spaceContext,
                    userUuid,
                    grantRoles,
                    grantTarget.source,
                ),
            );
        });
    }

    private static withGrantAccess(
        spaceContext: SpaceAccessContextForCasl,
        userUuid: string,
        grantRoles: SpaceMemberRole[],
        grantedVia: GrantSource,
    ): AccessContextForCasl {
        const hasSpacePath =
            spaceContext.access.some(
                (access) => access.userUuid === userUuid,
            ) ||
            spaceContext.admins.some((admin) => admin.userUuid === userUuid);
        return {
            ...spaceContext,
            access: [
                ...spaceContext.access,
                ...grantRoles.map((role) => ({
                    userUuid,
                    role,
                    hasDirectAccess: true,
                    projectRole: undefined,
                    inheritedRole: undefined,
                    inheritedFrom: undefined,
                    grantedVia,
                })),
            ],
            directOnly: !hasSpacePath,
        };
    }

    /**
     * Returns the CASL context for a space with ALL users' resolved access
     * (not filtered to a single user). Used for access propagation and
     * inheritance writes.
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

    mergeAdminAccess(ctx: SpaceAccessContextForCasl): SpaceAccess[] {
        const existingAccessUuids = new Set(
            ctx.access.map((access) => access.userUuid),
        );
        const adminAccess: SpaceAccess[] = ctx.admins
            .filter((admin) => !existingAccessUuids.has(admin.userUuid))
            .map((admin) => ({
                userUuid: admin.userUuid,
                role: SpaceMemberRole.ADMIN,
                hasDirectAccess: false,
                projectRole: ProjectMemberRole.ADMIN,
                inheritedRole:
                    admin.source === 'organization'
                        ? OrganizationMemberRole.ADMIN
                        : ProjectMemberRole.ADMIN,
                inheritedFrom: admin.source,
            }));

        return [...ctx.access, ...adminAccess];
    }

    async getPaginatedSpaceAccess(
        spaceUuid: string,
        {
            paginateArgs,
            filters,
            currentUserUuid,
        }: {
            paginateArgs?: KnexPaginateArgs;
            filters?: SpaceAccessListFilters;
            currentUserUuid?: string;
        },
    ): Promise<KnexPaginatedData<SpaceShare[]>> {
        const accessContexts = await this.getSpacesCaslContext(
            [spaceUuid],
            filters?.userUuids?.length
                ? { userUuids: filters.userUuids }
                : undefined,
        );
        const ctx = accessContexts[spaceUuid];
        if (!ctx) {
            throw new NotFoundError(
                `Couldn't find access context for space ${spaceUuid}`,
            );
        }

        const allAccess = this.mergeAdminAccess(ctx);
        const filteredAccess = filters?.directOnly
            ? allAccess.filter(
                  (access) =>
                      access.inheritedFrom !== 'parent_space' &&
                      (access.hasDirectAccess ||
                          access.inheritedFrom === 'space_group'),
              )
            : allAccess;
        const accessByUserUuid = new Map(
            filteredAccess.map((access) => [access.userUuid, access]),
        );
        const { data, pagination } =
            await this.spacePermissionModel.getPaginatedUserMetadata(
                filteredAccess.map((access) => access.userUuid),
                paginateArgs,
                {
                    searchQuery: filters?.searchQuery,
                    currentUserUuidFirst: currentUserUuid,
                },
            );

        return {
            data: data.map(({ userUuid, ...metadata }) => ({
                ...accessByUserUuid.get(userUuid)!,
                userUuid,
                ...metadata,
            })),
            ...(pagination ? { pagination } : {}),
        };
    }

    /**
     * Custom-role assignments persist a placeholder in the legacy `role`
     * column (`viewer` on project/group access, `member` on org memberships)
     * with the real role in `role_uuid`. Replace the placeholder with the
     * role derived from the custom role's scopes so inherited space access
     * reflects what the role actually grants.
     */
    private async resolveCustomRoleAccess(
        projectAccessMap: Record<string, ProjectSpaceAccessWithCustomRole[]>,
        organizationAccessMap: Record<
            string,
            OrganizationSpaceAccessWithCustomRole[]
        >,
        { trx }: { trx?: Knex } = {},
    ): Promise<{
        projectAccessMap: Record<string, ProjectSpaceAccess[]>;
        organizationAccessMap: Record<string, OrganizationSpaceAccess[]>;
    }> {
        const heldCustomRoleUuids = (access: {
            roleUuid: string | null;
            extraRoleUuids: string[];
        }) => [
            ...(access.roleUuid ? [access.roleUuid] : []),
            ...access.extraRoleUuids,
        ];
        const customRoleUuids = [
            ...new Set(
                [
                    ...Object.values(projectAccessMap).flat(),
                    ...Object.values(organizationAccessMap).flat(),
                ].flatMap(heldCustomRoleUuids),
            ),
        ];
        if (customRoleUuids.length === 0) {
            return { projectAccessMap, organizationAccessMap };
        }

        const scopesByRole = await this.spacePermissionModel.getRoleScopes(
            customRoleUuids,
            { trx },
        );
        const unionScopes = (roleUuids: string[]) =>
            roleUuids.flatMap((roleUuid) => scopesByRole[roleUuid] ?? []);

        return {
            projectAccessMap: Object.fromEntries(
                Object.entries(projectAccessMap).map(
                    ([spaceUuid, accessList]) => [
                        spaceUuid,
                        accessList.map(
                            ({ roleUuid, extraRoleUuids, ...access }) => {
                                const held = heldCustomRoleUuids({
                                    roleUuid,
                                    extraRoleUuids,
                                });
                                return held.length > 0
                                    ? {
                                          ...access,
                                          role: getProjectRoleForRoleSetSpaceAccess(
                                              {
                                                  systemRole: roleUuid
                                                      ? null
                                                      : access.role,
                                                  customRoleScopes:
                                                      unionScopes(held),
                                              },
                                          ),
                                      }
                                    : access;
                            },
                        ),
                    ],
                ),
            ),
            organizationAccessMap: Object.fromEntries(
                Object.entries(organizationAccessMap).map(
                    ([spaceUuid, accessList]) => [
                        spaceUuid,
                        accessList.map(
                            ({ roleUuid, extraRoleUuids, ...access }) => {
                                const held = heldCustomRoleUuids({
                                    roleUuid,
                                    extraRoleUuids,
                                });
                                return held.length > 0
                                    ? {
                                          ...access,
                                          role: getOrganizationRoleForRoleSetSpaceAccess(
                                              {
                                                  systemRole: roleUuid
                                                      ? null
                                                      : access.role,
                                                  customRoleScopes:
                                                      unionScopes(held),
                                              },
                                          ),
                                      }
                                    : access;
                            },
                        ),
                    ],
                ),
            ),
        };
    }

    /**
     * Gets the access context for a list of space uuids so we can check against CASL.
     *
     * Chain-aware resolution: walks each space's inheritance chain (up to the
     * first ancestor with inherit_parent_permissions=false, or the root).
     * Direct access is aggregated from all spaces in the chain. Project/org
     * access is only included when the chain reaches a root space that inherits
     * from the project.
     *
     * Uses resolveSpaceAccess ("most permissive wins" across chain).
     */
    private async getSpacesCaslContext(
        spaceUuidsArg: string[],
        filters?: { userUuid?: string; userUuids?: string[] },
        { trx }: { trx?: Knex } = {},
    ): Promise<Record<string, SpaceAccessContextForCasl>> {
        const uniqueSpaceUuids = [...new Set(spaceUuidsArg)];

        // Get inheritance chains for all spaces in a single batched query
        const chainMap = await this.spacePermissionModel.getInheritanceChains(
            uniqueSpaceUuids,
            { trx },
        );
        const chains = uniqueSpaceUuids
            .filter((uuid) => chainMap[uuid] !== undefined)
            .map((uuid) => ({
                spaceUuid: uuid,
                ...chainMap[uuid],
            }));

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
        const [
            directAccessMap,
            rawProjectAccessMap,
            rawOrgAccessMap,
            spaceInfo,
        ] = await Promise.all([
            this.spacePermissionModel.getDirectSpaceAccess(
                allChainSpaceUuids,
                filters,
                { trx },
            ),
            allChainsRootSpaceUuids.length > 0
                ? this.spacePermissionModel.getProjectSpaceAccess(
                      allChainsRootSpaceUuids,
                      filters,
                      { trx },
                  )
                : Promise.resolve(
                      {} as Record<string, ProjectSpaceAccessWithCustomRole[]>,
                  ),
            allChainsRootSpaceUuids.length > 0
                ? this.spacePermissionModel.getOrganizationSpaceAccess(
                      allChainsRootSpaceUuids,
                      filters,
                      { trx },
                  )
                : Promise.resolve(
                      {} as Record<
                          string,
                          OrganizationSpaceAccessWithCustomRole[]
                      >,
                  ),
            this.spacePermissionModel.getSpaceInfo(uniqueSpaceUuids, {
                trx,
            }),
        ]);

        // Substitute scope-derived roles for custom-role placeholder rows
        const { projectAccessMap, organizationAccessMap: orgAccessMap } =
            await this.resolveCustomRoleAccess(
                rawProjectAccessMap,
                rawOrgAccessMap,
                { trx },
            );

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

            const access = resolveSpaceAccess({
                spaceUuid,
                inheritsFromOrgOrProject,
                chainDirectAccess,
                projectAccess,
                organizationAccess: orgAccess,
            });

            // Build the admin map project-first, then overwrite with org —
            // org source wins on dedup.
            const adminSource = new Map<string, SpaceAdmin['source']>();
            for (const a of projectAccess) {
                if (a.role === ProjectMemberRole.ADMIN) {
                    adminSource.set(a.userUuid, 'project');
                }
            }
            for (const a of orgAccess) {
                if (a.role === OrganizationMemberRole.ADMIN) {
                    adminSource.set(a.userUuid, 'organization');
                }
            }
            const admins: SpaceAdmin[] = Array.from(
                adminSource,
                ([userUuid, source]) => ({ userUuid, source }),
            );

            result[spaceUuid] = {
                organizationUuid: space.organizationUuid,
                projectUuid: space.projectUuid,
                inheritsFromOrgOrProject,
                access,
                admins,
            };
        }
        return result;
    }

    /**
     * Gets group access for a space.
     */
    async getGroupAccess(spaceUuid: string): Promise<SpaceGroup[]> {
        return this.spacePermissionModel.getGroupAccess(spaceUuid);
    }

    /**
     * Returns the UUID of the first root space the user can view in the project.
     * Uses CASL-based permission checking via getAccessibleSpaceUuids.
     */
    async getFirstViewableSpaceUuid(
        user: SessionUser,
        projectUuid: string,
    ): Promise<string> {
        const allRootSpaceUuids =
            await this.spaceModel.getRootSpaceUuidsForProject(projectUuid);
        const accessible = await this.getAccessibleSpaceUuids(
            'view',
            user,
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

        const directAccessMap =
            await this.spacePermissionModel.getDirectSpaceAccess(
                uniqueSpaceUuids,
            );

        return Object.fromEntries(
            uniqueSpaceUuids.map((spaceUuid) => [
                spaceUuid,
                directAccessMap[spaceUuid]?.map((e) => e.userUuid) ?? [],
            ]),
        );
    }

    /**
     * Copies inherited permissions as direct access entries on a space.
     * Called when inheritParentPermissions transitions true → false so that
     * users who had access via parent spaces don't suddenly lose it.
     *
     * Returns the user/group entries to insert (caller wraps in transaction
     * together with the space update via SpaceModel.updateWithCopiedPermissions).
     */
    async getInheritedPermissionsToCopy(spaceUuid: string): Promise<{
        userAccessEntries: { userUuid: string; role: SpaceAccess['role'] }[];
        groupAccessEntries: {
            groupUuid: string;
            role: SpaceGroup['spaceRole'];
        }[];
    }> {
        const chainEntry = await this.spacePermissionModel.getInheritanceChains(
            [spaceUuid],
        );

        if (!chainEntry) {
            throw new NotFoundError(`Space ${spaceUuid} not found`);
        }
        const { chain } = chainEntry[spaceUuid];
        const ancestorUuids = chain
            .map((item) => item.spaceUuid)
            .filter((uuid) => uuid !== spaceUuid);

        const ancestorDirectAccess =
            await this.spacePermissionModel.getDirectSpaceAccess(ancestorUuids);

        // Deduplicate user and group access entries, keeping highest role per user/group
        const userAccessMap = new Map<string, SpaceAccess['role']>();
        const groupAccessMap = new Map<string, SpaceGroup['spaceRole']>();

        for (const access of Object.values(ancestorDirectAccess).flat()) {
            if (access.from === 'user_access') {
                const existing = userAccessMap.get(access.userUuid);
                const highest = getHighestSpaceRole([existing, access.role]);
                if (highest !== undefined) {
                    userAccessMap.set(access.userUuid, highest);
                }
            } else if (
                access.from === 'group_access' &&
                access.groupUuid !== null
            ) {
                const existing = groupAccessMap.get(access.groupUuid);
                const highest = getHighestSpaceRole([existing, access.role]);
                if (highest !== undefined) {
                    groupAccessMap.set(access.groupUuid, highest);
                }
            }
        }

        const userAccessEntries = [...userAccessMap.entries()].map(
            ([userUuid, role]) => ({ userUuid, role }),
        );
        const groupAccessEntries = [...groupAccessMap.entries()].map(
            ([groupUuid, role]) => ({ groupUuid, role }),
        );

        return { userAccessEntries, groupAccessEntries };
    }

    async getUserMetadataByUuids(
        userUuids: string[],
    ): Promise<Record<string, SpaceAccessUserMetadata>> {
        return this.spacePermissionModel.getUserMetadataByUuids(userUuids);
    }
}
