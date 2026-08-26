import { subject } from '@casl/ability';
import {
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

// A content type's direct-grant lookup (e.g. DashboardAccessModel.getUserAccess
// or SavedChartAccessModel.getUserAccess), pre-bound to the requesting user.
type GrantLookup = (
    resourceUuids: string[],
    opts: { organizationUuid: string },
) => Promise<Record<string, DirectAccess>>;

export type DashboardAccessContextForCasl = SpaceAccessContextForCasl & {
    /**
     * True when the requester has no space-derived access path (membership,
     * inheritance, or admin standing) and reaches the content only through
     * direct content grants.
     */
    directOnly: boolean;
};

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
     * Returns the CASL context for a space (organizationUuid, projectUuid, inheritsFromOrgOrProject, access)
     * without performing any permission checks. Callers use this to build their own
     * `subject(...)` checks when the resource type is not Space.
     */
    async getSpaceAccessContext(
        userUuid: string,
        spaceUuid: string,
        { trx }: { trx?: Knex } = {},
    ): Promise<SpaceAccessContextForCasl> {
        const accessContext = await this.getSpacesCaslContext(
            [spaceUuid],
            {
                userUuid,
            },
            { trx },
        );
        const ctx = accessContext[spaceUuid];
        if (!ctx) {
            throw new NotFoundError(
                `Couldn't find access context for space ${spaceUuid}`,
            );
        }
        return ctx;
    }

    /**
     * The single choke point for authorizing a dashboard-owned chart through
     * a direct dashboard grant. Read this before touching any grant call site.
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
     * Pass `uuid: null` for a chart with no owning dashboard, AND at every
     * boundary-crossing call site (copying or moving content out of the
     * dashboard) where the grant must not count: the space-only context is
     * returned and no grant lookup runs. The `expectNoGrantRows` test tripwire
     * guards those sites. See also `ld-permissions` skill and this service's
     * CLAUDE.md.
     */
    async getDashboardAccessContext(
        userUuid: string,
        dashboard: { uuid: string | null; spaceUuid: string },
    ): Promise<DashboardAccessContextForCasl> {
        return this.resolveGrantAccessContext(userUuid, dashboard, {
            grantedVia: 'dashboard',
            resourceLabel: 'Dashboard',
            lookupGrants: (uuids, opts) =>
                this.dashboardAccessModel.getUserAccess(uuids, userUuid, opts),
        });
    }

    /**
     * Direct-grant access context for a saved (explore) chart. Same kernel and
     * boundary rule as `getDashboardAccessContext` (read its doc); grants are
     * tagged `grantedVia: 'saved_chart'`. Pass `uuid: null` for a chart with no
     * direct policy, or at a boundary-crossing site where grants must not
     * count.
     */
    async getSavedChartAccessContext(
        userUuid: string,
        chart: { uuid: string | null; spaceUuid: string },
    ): Promise<DashboardAccessContextForCasl> {
        return this.resolveGrantAccessContext(userUuid, chart, {
            grantedVia: 'saved_chart',
            resourceLabel: 'Saved chart',
            lookupGrants: (uuids, opts) =>
                this.savedChartAccessModel.getUserAccess(uuids, userUuid, opts),
        });
    }

    /** Batched `getSavedChartAccessContext` for hot paths (listings, tiles). */
    async getSavedChartsAccessContext(
        userUuid: string,
        charts: { uuid: string | null; spaceUuid: string }[],
    ): Promise<(DashboardAccessContextForCasl | undefined)[]> {
        return this.resolveGrantsAccessContext(userUuid, charts, {
            grantedVia: 'saved_chart',
            lookupGrants: (uuids, opts) =>
                this.savedChartAccessModel.getUserAccess(uuids, userUuid, opts),
        });
    }

    /**
     * Access context for a chart, routed by ownership: a dashboard-owned chart
     * (`dashboardUuid` set) resolves through the owning dashboard's grants; a
     * space-saved chart resolves through its own grants. Callers pass the
     * chart's own uuid, its dashboardUuid, and its space; this is the entry
     * point every chart read/write path should use.
     */
    async getChartAccessContext(
        userUuid: string,
        chart: {
            uuid: string;
            dashboardUuid: string | null;
            spaceUuid: string;
        },
    ): Promise<DashboardAccessContextForCasl> {
        return chart.dashboardUuid
            ? this.getDashboardAccessContext(userUuid, {
                  uuid: chart.dashboardUuid,
                  spaceUuid: chart.spaceUuid,
              })
            : this.getSavedChartAccessContext(userUuid, {
                  uuid: chart.uuid,
                  spaceUuid: chart.spaceUuid,
              });
    }

    /**
     * Batched `getChartAccessContext`, aligned with the input. Owned charts
     * resolve in one dashboard-grant batch and space charts in one
     * chart-grant batch (non-applicable entries take the no-lookup null path),
     * so a mixed dashboard load costs two grant queries, never N+1.
     */
    async getChartsAccessContext(
        userUuid: string,
        charts: {
            uuid: string;
            dashboardUuid: string | null;
            spaceUuid: string;
        }[],
    ): Promise<(DashboardAccessContextForCasl | undefined)[]> {
        const [dashboardContexts, chartContexts] = await Promise.all([
            this.getDashboardsAccessContext(
                userUuid,
                charts.map((chart) => ({
                    uuid: chart.dashboardUuid,
                    spaceUuid: chart.spaceUuid,
                })),
            ),
            this.getSavedChartsAccessContext(
                userUuid,
                charts.map((chart) => ({
                    uuid: chart.dashboardUuid ? null : chart.uuid,
                    spaceUuid: chart.spaceUuid,
                })),
            ),
        ]);
        return charts.map((chart, index) =>
            chart.dashboardUuid
                ? dashboardContexts[index]
                : chartContexts[index],
        );
    }

    /**
     * Batched `getDashboardAccessContext` for hot paths that resolve many
     * (dashboard, space) refs at once. Returns contexts aligned with the input;
     * undefined where the space context could not be resolved. Doubtful refs
     * degrade to the space-only context — never to more access.
     */
    async getDashboardsAccessContext(
        userUuid: string,
        dashboards: { uuid: string | null; spaceUuid: string }[],
    ): Promise<(DashboardAccessContextForCasl | undefined)[]> {
        return this.resolveGrantsAccessContext(userUuid, dashboards, {
            grantedVia: 'dashboard',
            lookupGrants: (uuids, opts) =>
                this.dashboardAccessModel.getUserAccess(uuids, userUuid, opts),
        });
    }

    // The canonical single-ref grant kernel that every getXAccessContext
    // delegates to. See the getDashboardAccessContext doc for the boundary
    // rule. One space fetch, one gate check, one grant lookup; a space the
    // resource does not belong to is a caller bug and throws.
    private async resolveGrantAccessContext(
        userUuid: string,
        ref: { uuid: string | null; spaceUuid: string },
        {
            grantedVia,
            resourceLabel,
            lookupGrants,
        }: {
            grantedVia: GrantSource;
            resourceLabel: string;
            lookupGrants: GrantLookup;
        },
    ): Promise<DashboardAccessContextForCasl> {
        const spaceContext = await this.getSpaceAccessContext(
            userUuid,
            ref.spaceUuid,
        );
        const spaceOnlyContext = { ...spaceContext, directOnly: false };
        if (ref.uuid === null) {
            return spaceOnlyContext;
        }
        if (
            !(await this.directAccessFeatureGate.isEnabledForUser({
                userUuid,
                organizationUuid: spaceContext.organizationUuid,
            }))
        ) {
            return spaceOnlyContext;
        }
        const grants = await lookupGrants([ref.uuid], {
            organizationUuid: spaceContext.organizationUuid,
        });
        const grant = grants[ref.uuid];
        if (grant === undefined) {
            return spaceOnlyContext;
        }
        const grantRoles = [
            ...(grant.userRole ? [grant.userRole] : []),
            ...grant.groupRoles,
        ];
        if (grantRoles.length === 0) {
            return spaceOnlyContext;
        }
        if (grant.spaceUuid !== ref.spaceUuid) {
            throw new ParameterError(
                `${resourceLabel} ${ref.uuid} does not belong to space ${ref.spaceUuid}`,
            );
        }
        return SpacePermissionService.withGrantAccess(
            spaceContext,
            userUuid,
            grantRoles,
            grantedVia,
        );
    }

    // Batched sibling of resolveGrantAccessContext: one space batch, one gate
    // check, one grant lookup. Doubtful refs degrade to space-only rather than
    // throwing, so one bad ref never fails a whole hot-path request.
    private async resolveGrantsAccessContext(
        userUuid: string,
        refs: { uuid: string | null; spaceUuid: string }[],
        {
            grantedVia,
            lookupGrants,
        }: { grantedVia: GrantSource; lookupGrants: GrantLookup },
    ): Promise<(DashboardAccessContextForCasl | undefined)[]> {
        const uniqueSpaceUuids = [...new Set(refs.map((ref) => ref.spaceUuid))];
        const spaceContexts = await this.getSpacesAccessContext(
            userUuid,
            uniqueSpaceUuids,
        );
        const spaceOnly = (ref: {
            spaceUuid: string;
        }): DashboardAccessContextForCasl | undefined => {
            const ctx = spaceContexts[ref.spaceUuid];
            return ctx ? { ...ctx, directOnly: false } : undefined;
        };

        const resourceUuids = [
            ...new Set(
                refs.flatMap((ref) =>
                    ref.uuid !== null && spaceContexts[ref.spaceUuid]
                        ? [ref.uuid]
                        : [],
                ),
            ),
        ];
        const organizationUuid = refs
            .map((ref) => spaceContexts[ref.spaceUuid]?.organizationUuid)
            .find((uuid) => uuid !== undefined);
        if (
            resourceUuids.length === 0 ||
            organizationUuid === undefined ||
            !(await this.directAccessFeatureGate.isEnabledForUser({
                userUuid,
                organizationUuid,
            }))
        ) {
            return refs.map(spaceOnly);
        }

        const grants = await lookupGrants(resourceUuids, { organizationUuid });
        return refs.map((ref) => {
            const spaceContext = spaceContexts[ref.spaceUuid];
            if (spaceContext === undefined || ref.uuid === null) {
                return spaceOnly(ref);
            }
            const grant = grants[ref.uuid];
            if (grant === undefined) {
                return spaceOnly(ref);
            }
            const grantRoles = [
                ...(grant.userRole ? [grant.userRole] : []),
                ...grant.groupRoles,
            ];
            if (
                grantRoles.length === 0 ||
                grant.spaceUuid !== ref.spaceUuid ||
                spaceContext.organizationUuid !== organizationUuid
            ) {
                return spaceOnly(ref);
            }
            return SpacePermissionService.withGrantAccess(
                spaceContext,
                userUuid,
                grantRoles,
                grantedVia,
            );
        });
    }

    private static withGrantAccess(
        spaceContext: SpaceAccessContextForCasl,
        userUuid: string,
        grantRoles: SpaceMemberRole[],
        grantedVia: GrantSource,
    ): DashboardAccessContextForCasl {
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
     * Gets the access context for a list of space uuids
     * @param userUuid - The user uuid to get the access context for
     * @param spaceUuids - The space uuids to get the access context for
     * @returns The access context for the given space uuids
     */
    async getSpacesAccessContext(
        userUuid: string,
        spaceUuids: string[],
        { trx }: { trx?: Knex } = {},
    ): Promise<Record<string, SpaceAccessContextForCasl>> {
        return this.getSpacesCaslContext(spaceUuids, { userUuid }, { trx });
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
