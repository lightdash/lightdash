import { subject } from '@casl/ability';
import {
    AbilityAction,
    BulkActionable,
    CreateSpace,
    ForbiddenError,
    getHighestSpaceRole,
    NotFoundError,
    ParameterError,
    SessionUser,
    Space,
    SpaceDeleteImpact,
    SpaceMemberRole,
    SpaceShare,
    SpaceSummary,
    UpdateSpace,
    type SpaceAccess,
} from '@lightdash/common';
import { Knex } from 'knex';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import type { AppGenerateService } from '../../ee/services/AppGenerateService/AppGenerateService';
import { OrganizationModel } from '../../models/OrganizationModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';
import type { DashboardService } from '../DashboardService/DashboardService';
import type { SavedChartService } from '../SavedChartsService/SavedChartService';
import type {
    SoftDeletableService,
    SoftDeleteOptions,
} from '../SoftDeletableService';
import { SpacePermissionService } from './SpacePermissionService';

type SpaceServiceArguments = {
    analytics: LightdashAnalytics;
    lightdashConfig: LightdashConfig;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    organizationModel: OrganizationModel;
    pinnedListModel: PinnedListModel;
    spacePermissionService: SpacePermissionService;
    savedChartService: SavedChartService;
    dashboardService: DashboardService;
    // EE-only. When the license isn't active the repository leaves this
    // undefined and the cascade skips data apps (there are none to delete).
    appGenerateService: AppGenerateService | undefined;
};

export const hasDirectAccessToSpace = (
    user: SessionUser,
    space: {
        inheritsFromOrgOrProject: boolean;
        access: SpaceAccess[];
    },
): boolean => {
    const userUuidsWithDirectAccess = space.access.reduce<string[]>(
        (acc, access) => {
            if (typeof access === 'string') {
                return [...acc, access];
            }
            if (access.hasDirectAccess) {
                return [...acc, access.userUuid];
            }
            return acc;
        },
        [],
    );

    return (
        space.inheritsFromOrgOrProject ||
        userUuidsWithDirectAccess?.includes(user.userUuid)
    );
};

export class SpaceService
    extends BaseService
    implements BulkActionable<Knex>, SoftDeletableService
{
    private readonly analytics: LightdashAnalytics;

    private readonly lightdashConfig: LightdashConfig;

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly organizationModel: OrganizationModel;

    private readonly pinnedListModel: PinnedListModel;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly savedChartService: SavedChartService;

    private readonly dashboardService: DashboardService;

    private readonly appGenerateService: AppGenerateService | undefined;

    constructor(args: SpaceServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.lightdashConfig = args.lightdashConfig;
        this.projectModel = args.projectModel;
        this.spaceModel = args.spaceModel;
        this.organizationModel = args.organizationModel;
        this.pinnedListModel = args.pinnedListModel;
        this.spacePermissionService = args.spacePermissionService;
        this.savedChartService = args.savedChartService;
        this.dashboardService = args.dashboardService;
        this.appGenerateService = args.appGenerateService;
    }

    /** @internal For unit testing only */
    async _userCanActionSpace(
        user: Pick<SessionUser, 'ability' | 'userUuid'>,
        contentType: 'Space' | 'Dashboard' | 'Chart',
        space: Pick<SpaceSummary, 'uuid'>,
        action: AbilityAction,
    ): Promise<boolean> {
        const spaceCtx =
            await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                space.uuid,
            );
        // eslint-disable-next-line no-direct-ability-check -- test-only method exercises raw CASL abilities
        return user.ability.can(action, subject(contentType, spaceCtx));
    }

    /**
     * Assembles a full Space object by combining core space data with
     * access info from SpacePermissionService and user metadata.
     */
    private async assembleFullSpace(
        spaceUuid: string,
        user: SessionUser,
    ): Promise<Space> {
        const space = await this.spaceModel.get(spaceUuid);
        const [ctx, groupsAccess, rawBreadcrumbs] = await Promise.all([
            this.spacePermissionService.getAllSpaceAccessContext(spaceUuid),
            this.spacePermissionService.getGroupAccess(spaceUuid),
            this.spaceModel.getSpaceBreadcrumbs(spaceUuid, space.projectUuid),
        ]);

        // Enrich breadcrumbs with user access info
        const ancestorUuids = rawBreadcrumbs.map((b) => b.uuid);
        const accessibleUuids = new Set(
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                ancestorUuids,
            ),
        );
        const breadcrumbs = rawBreadcrumbs.map((b) => ({
            ...b,
            hasAccess: accessibleUuids.has(b.uuid),
        }));

        const userInfoMap =
            await this.spacePermissionService.getUserMetadataByUuids(
                ctx.access.map((a) => a.userUuid),
            );

        const access: SpaceShare[] = ctx.access.map((a) => ({
            ...a,
            firstName: userInfoMap[a.userUuid]?.firstName ?? '',
            lastName: userInfoMap[a.userUuid]?.lastName ?? '',
            email: userInfoMap[a.userUuid]?.email ?? '',
        }));

        const [queries, dashboards, childSpaces] = await Promise.all([
            this.spaceModel.getSpaceQueries([spaceUuid]),
            this.spaceModel.getSpaceDashboards([spaceUuid]),
            this.spaceModel.find({ parentSpaceUuid: spaceUuid }),
        ]);

        return {
            ...space,
            inheritsFromOrgOrProject: ctx.inheritsFromOrgOrProject,
            queries,
            dashboards,
            childSpaces,
            access,
            groupsAccess,
            breadcrumbs,
        };
    }

    async getSpace(
        projectUuid: string,
        user: SessionUser,
        spaceUuid: string,
    ): Promise<Space> {
        if (!(await this.spacePermissionService.can('view', user, spaceUuid))) {
            throw new ForbiddenError();
        }

        return this.assembleFullSpace(spaceUuid, user);
    }

    async createSpace(
        projectUuid: string,
        user: SessionUser,
        space: CreateSpace,
    ): Promise<Space> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'create',
                subject('Space', {
                    organizationUuid,
                    projectUuid,
                    metadata: { spaceName: space.name },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (space.parentSpaceUuid) {
            // Check if parent space uuid is in project
            const parentSpace = await this.spaceModel.getSpaceSummary(
                space.parentSpaceUuid,
            );
            if (parentSpace.projectUuid !== projectUuid) {
                throw new NotFoundError('Parent space not found');
            }
        }

        let inheritParentPermissions: boolean;
        if (space.inheritParentPermissions !== undefined) {
            inheritParentPermissions = space.inheritParentPermissions;
        } else if (space.parentSpaceUuid) {
            inheritParentPermissions = true;
        } else {
            inheritParentPermissions = false;
        }

        const newSpace = await this.spaceModel.createSpace(
            {
                name: space.name,
                inheritParentPermissions,
                parentSpaceUuid: space.parentSpaceUuid ?? null,
            },
            {
                projectUuid,
                userId: user.userId,
            },
        );

        // Nested spaces MVP: Nested spaces inherit access from their root space, but don't need to have that access added to them explicitly
        if (space.access)
            await Promise.all(
                space.access.map((access) =>
                    this.spaceModel.addSpaceAccess(
                        newSpace.uuid,
                        access.userUuid,
                        access.role,
                    ),
                ),
            );
        await this.spaceModel.addSpaceAccess(
            newSpace.uuid,
            user.userUuid,
            SpaceMemberRole.ADMIN,
        ); // user who created the space by default would be set to space admin
        this.analytics.track({
            event: 'space.created',
            userId: user.userUuid,
            properties: {
                name: space.name,
                spaceId: newSpace.uuid,
                projectId: projectUuid,
                inheritParentPermissions,
                userAccessCount: space.access?.length ?? 0,
                isNested: !!space.parentSpaceUuid,
            },
        });
        return this.assembleFullSpace(newSpace.uuid, user);
    }

    async updateSpace(
        user: SessionUser,
        spaceUuid: string,
        updateSpace: UpdateSpace,
    ): Promise<Space> {
        if (
            !(await this.spacePermissionService.can('manage', user, spaceUuid))
        ) {
            throw new ForbiddenError();
        }

        const space = await this.spaceModel.getSpaceSummary(spaceUuid);

        if (updateSpace.colorPaletteUuid) {
            const palette = await this.organizationModel.findColorPalette(
                space.organizationUuid,
                updateSpace.colorPaletteUuid,
            );
            if (!palette) {
                throw new ParameterError(
                    'Color palette does not belong to this organization',
                );
            }
        }

        const { inheritParentPermissions } = updateSpace;

        // When switching from inherit to not-inherit, copy inherited permissions
        // as direct access entries so users don't lose access.
        const turnInheritOff =
            space.inheritParentPermissions === true &&
            inheritParentPermissions === false;

        if (turnInheritOff) {
            const ctx = await this.spacePermissionService.getSpaceAccessContext(
                user.userUuid,
                spaceUuid,
            );
            const userAccess = ctx.access.find(
                (a) => a.userUuid === user.userUuid,
            );

            const { userAccessEntries, groupAccessEntries } =
                await this.spacePermissionService.getInheritedPermissionsToCopy(
                    spaceUuid,
                );

            if (userAccess && !userAccess.hasDirectAccess) {
                const existingIdx = userAccessEntries.findIndex(
                    (e) => e.userUuid === user.userUuid,
                );
                if (existingIdx >= 0) {
                    // User already inherited from an ancestor — keep highest role
                    const highest = getHighestSpaceRole([
                        userAccessEntries[existingIdx].role,
                        userAccess.role,
                    ]);
                    if (highest !== undefined) {
                        userAccessEntries[existingIdx].role = highest;
                    }
                } else {
                    userAccessEntries.push({
                        userUuid: user.userUuid,
                        role: userAccess.role,
                    });
                }
            }
            await this.spaceModel.updateWithCopiedPermissions(
                spaceUuid,
                { ...updateSpace, inheritParentPermissions },
                userAccessEntries,
                groupAccessEntries,
            );
        } else {
            await this.spaceModel.update(spaceUuid, {
                ...updateSpace,
                inheritParentPermissions,
            });
        }

        const updatedSpace = await this.assembleFullSpace(spaceUuid, user);
        const directAccessCount = updatedSpace.access.filter(
            (a) => a.hasDirectAccess,
        ).length;

        const isNested = !!space.parentSpaceUuid;

        this.analytics.track({
            event: 'space.updated',
            userId: user.userUuid,
            properties: {
                name: space.name,
                spaceId: spaceUuid,
                projectId: space.projectUuid,
                inheritParentPermissions: updatedSpace.inheritParentPermissions,
                isNested,
                // This used to rely on summary.access.length, which only contained direct user access and ignored direct group access
                userAccessCount: directAccessCount,
            },
        });

        return updatedSpace;
    }

    private async hasAccess(
        action: AbilityAction,
        actor: {
            user: SessionUser;
            projectUuid: string;
        },
        resource: {
            spaceUuid: string;
            targetSpaceUuid?: string;
        },
    ) {
        if (
            !(await this.spacePermissionService.can(
                action,
                actor.user,
                resource.spaceUuid,
            ))
        ) {
            throw new ForbiddenError(
                `You don't have access to ${action} this space`,
            );
        }

        if (resource.targetSpaceUuid) {
            if (
                !(await this.spacePermissionService.can(
                    action,
                    actor.user,
                    resource.targetSpaceUuid,
                ))
            ) {
                throw new ForbiddenError(
                    `You don't have access to ${action} this space in the new parent space`,
                );
            }
        }
    }

    async moveToSpace(
        user: SessionUser,
        {
            projectUuid,
            itemUuid: spaceUuid,
            targetSpaceUuid,
        }: {
            projectUuid: string;
            itemUuid: string;
            targetSpaceUuid: string | null;
        },
        {
            tx,
            checkForAccess = true,
            trackEvent = true,
        }: {
            tx?: Knex;
            checkForAccess?: boolean;
            trackEvent?: boolean;
        } = {},
    ) {
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);

        if (!space) {
            throw new NotFoundError('Space not found');
        }

        if (space.parentSpaceUuid === targetSpaceUuid) {
            throw new ParameterError(
                `Space ${spaceUuid} is already in the correct parent space ${targetSpaceUuid}`,
            );
        }

        if (checkForAccess) {
            await this.hasAccess(
                'manage',
                { user, projectUuid },
                {
                    spaceUuid,
                    targetSpaceUuid: targetSpaceUuid ?? undefined,
                },
            );
        }

        await this.spaceModel.moveToSpace(
            {
                projectUuid: space.projectUuid,
                itemUuid: spaceUuid,
                targetSpaceUuid,
            },
            { tx },
        );

        if (trackEvent) {
            this.analytics.track({
                event: 'space.moved',
                userId: user.userUuid,
                properties: {
                    name: space.name,
                    spaceId: spaceUuid,
                    oldParentSpaceId: space.parentSpaceUuid,
                    newParentSpaceId: targetSpaceUuid,
                    projectId: space.projectUuid,
                },
            });
        }
    }

    async delete(
        user: SessionUser,
        spaceUuid: string,
        options?: SoftDeleteOptions,
    ): Promise<void> {
        if (!options?.bypassPermissions) {
            if (
                !(await this.spacePermissionService.can(
                    'delete',
                    user,
                    spaceUuid,
                ))
            ) {
                throw new ForbiddenError();
            }
        } else {
            this.logBypassEvent(user, 'delete', {
                type: 'Space',
                metadata: { spaceUuid },
                organizationUuid: user.organizationUuid ?? 'unknown',
            });
        }

        const space = await this.spaceModel.getSpaceSummary(spaceUuid);

        if (this.lightdashConfig.softDelete.enabled) {
            await this.softDelete(user, spaceUuid, {
                bypassPermissions: true, // perms checked above
            });
        } else {
            await this.permanentDelete(user, spaceUuid, {
                bypassPermissions: true, // perms checked above
            });
        }

        this.analytics.track({
            event: 'space.deleted',
            userId: user.userUuid,
            properties: {
                name: space.name,
                spaceId: spaceUuid,
                projectId: space.projectUuid,
                isNested: !!space.parentSpaceUuid,
                softDelete: this.lightdashConfig.softDelete.enabled,
            },
        });
    }

    async softDelete(
        user: SessionUser,
        spaceUuid: string,
        options?: SoftDeleteOptions,
    ): Promise<void> {
        if (!options?.bypassPermissions) {
            if (
                !(await this.spacePermissionService.can(
                    'delete',
                    user,
                    spaceUuid,
                ))
            ) {
                throw new ForbiddenError();
            }
        } else {
            this.logBypassEvent(user, 'delete', {
                type: 'Space',
                metadata: { spaceUuid },
                organizationUuid: user.organizationUuid ?? 'unknown',
            });
        }

        // Get all content UUIDs BEFORE soft-deleting
        const chartUuids =
            await this.spaceModel.getChartUuidsInSpace(spaceUuid);
        const dashboardUuids =
            await this.spaceModel.getDashboardUuidsInSpace(spaceUuid);
        const childSpaceUuids =
            await this.spaceModel.getChildSpaceUuids(spaceUuid);
        const apps = this.appGenerateService
            ? await this.spaceModel.getAppsInSpace(spaceUuid)
            : [];

        for (const chartUuid of chartUuids) {
            // eslint-disable-next-line no-await-in-loop
            await this.savedChartService.delete(user, chartUuid, {
                bypassPermissions: true, // space delete authorized above
            });
        }
        for (const dashboardUuid of dashboardUuids) {
            // eslint-disable-next-line no-await-in-loop
            await this.dashboardService.delete(user, dashboardUuid, {
                bypassPermissions: true, // space delete authorized above
            });
        }
        for (const { appUuid, projectUuid } of apps) {
            // eslint-disable-next-line no-await-in-loop
            await this.appGenerateService!.deleteApp(
                user,
                projectUuid,
                appUuid,
                { bypassPermissions: true }, // space delete authorized above
            );
        }
        for (const childSpaceUuid of childSpaceUuids) {
            // eslint-disable-next-line no-await-in-loop
            await this.delete(user, childSpaceUuid, {
                bypassPermissions: true, // space delete authorized above
            });
        }

        await this.spaceModel.softDelete(spaceUuid, user.userUuid);
    }

    async getDeleteImpact(
        user: SessionUser,
        spaceUuid: string,
    ): Promise<SpaceDeleteImpact> {
        if (
            !(await this.spacePermissionService.can('delete', user, spaceUuid))
        ) {
            throw new ForbiddenError();
        }

        const descendantUuids =
            await this.spaceModel.getDescendantSpaceUuids(spaceUuid);
        const allUuids = [spaceUuid, ...descendantUuids];

        const spaces = await this.spaceModel.find({ spaceUuids: allUuids });

        const [charts, sqlCharts, dashboards, apps] = await Promise.all([
            this.spaceModel.getSpaceQueries(allUuids),
            this.spaceModel.getSpaceSqlCharts(allUuids),
            this.spaceModel.getSpaceDashboards(allUuids),
            this.spaceModel.getSpaceApps(allUuids),
        ]);

        const allCharts = [...charts, ...sqlCharts];

        return {
            spaces: spaces.map((s) => ({
                uuid: s.uuid,
                name: s.name,
                parentSpaceUuid: s.parentSpaceUuid,
                chartCount: Number(s.chartCount),
                dashboardCount: Number(s.dashboardCount),
                appCount: Number(s.appCount),
            })),
            charts: allCharts.map((c) => ({
                uuid: c.uuid,
                name: c.name,
                spaceUuid: c.spaceUuid,
            })),
            dashboards: dashboards.map((d) => ({
                uuid: d.uuid,
                name: d.name,
                spaceUuid: d.spaceUuid,
            })),
            apps: apps.map((a) => ({
                uuid: a.uuid,
                spaceUuid: a.spaceUuid,
            })),
            chartCount: allCharts.length,
            dashboardCount: dashboards.length,
            appCount: apps.length,
        };
    }

    async restore(
        user: SessionUser,
        spaceUuid: string,
        options?: SoftDeleteOptions,
    ): Promise<void> {
        const space = await this.spaceModel.getSpaceSummary(spaceUuid, {
            deleted: true,
        });

        if (options?.bypassPermissions) {
            this.logBypassEvent(user, 'manage', {
                type: 'DeletedContent',
                metadata: { spaceUuid, spaceName: space.name },
                organizationUuid: space.organizationUuid,
                projectUuid: space.projectUuid,
            });
        } else {
            const auditedAbility = this.createAuditedAbility(user);
            const isAdmin = auditedAbility.can(
                'manage',
                subject('DeletedContent', {
                    organizationUuid: space.organizationUuid,
                    projectUuid: space.projectUuid,
                    metadata: { spaceUuid, spaceName: space.name },
                }),
            );

            if (!isAdmin) {
                if (space.deletedBy?.userUuid === user.userUuid) {
                    this.logBypassEvent(user, 'manage', {
                        type: 'DeletedContent',
                        metadata: { spaceUuid, spaceName: space.name },
                        organizationUuid: space.organizationUuid,
                        projectUuid: space.projectUuid,
                    });
                } else {
                    throw new ForbiddenError(
                        'You can only restore content you deleted',
                    );
                }
            }
        }

        await this.spaceModel.restore(spaceUuid);

        // Cascade: restore children that were cascade-deleted by the same user
        if (space.deletedBy?.userUuid) {
            const deletedChartUuids =
                await this.spaceModel.getChartUuidsInSpace(spaceUuid, {
                    deleted: true,
                    deletedByUserUuid: space.deletedBy.userUuid,
                });
            for (const chartUuid of deletedChartUuids) {
                // eslint-disable-next-line no-await-in-loop
                await this.savedChartService.restore(user, chartUuid, {
                    bypassPermissions: true, // space restore authorized above
                });
            }

            const deletedDashboardUuids =
                await this.spaceModel.getDashboardUuidsInSpace(spaceUuid, {
                    deleted: true,
                    deletedByUserUuid: space.deletedBy.userUuid,
                });
            for (const dashboardUuid of deletedDashboardUuids) {
                // eslint-disable-next-line no-await-in-loop
                await this.dashboardService.restore(user, dashboardUuid, {
                    bypassPermissions: true, // space restore authorized above
                });
            }

            if (this.appGenerateService) {
                const deletedApps = await this.spaceModel.getAppsInSpace(
                    spaceUuid,
                    {
                        deleted: true,
                        deletedByUserUuid: space.deletedBy.userUuid,
                    },
                );
                for (const { appUuid, projectUuid } of deletedApps) {
                    // eslint-disable-next-line no-await-in-loop
                    await this.appGenerateService.restoreApp(
                        user,
                        projectUuid,
                        appUuid,
                        { bypassPermissions: true }, // space restore authorized above
                    );
                }
            }

            const deletedChildSpaceUuids =
                await this.spaceModel.getChildSpaceUuids(spaceUuid, {
                    deleted: true,
                    deletedByUserUuid: space.deletedBy.userUuid,
                });
            for (const childSpaceUuid of deletedChildSpaceUuids) {
                // eslint-disable-next-line no-await-in-loop
                await this.restore(user, childSpaceUuid, {
                    bypassPermissions: true, // space restore authorized above
                });
            }
        }

        this.analytics.track({
            event: 'space.restored',
            userId: user.userUuid,
            properties: {
                name: space.name,
                spaceId: spaceUuid,
                projectId: space.projectUuid,
            },
        });
    }

    async permanentDelete(
        user: SessionUser,
        spaceUuid: string,
        options?: SoftDeleteOptions,
    ): Promise<void> {
        if (options?.bypassPermissions) {
            this.logBypassEvent(user, 'manage', {
                type: 'DeletedContent',
                metadata: { spaceUuid },
                organizationUuid: user.organizationUuid ?? 'unknown',
            });
        } else {
            const space = await this.spaceModel.getSpaceSummary(spaceUuid, {
                deleted: true,
            });
            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'manage',
                    subject('DeletedContent', {
                        organizationUuid: space.organizationUuid,
                        projectUuid: space.projectUuid,
                        metadata: { spaceUuid, spaceName: space.name },
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
        }

        // Apps' FK is ON DELETE SET NULL, so DB CASCADE doesn't clean them up.
        // Permanent-delete them explicitly (sandbox + S3 cleanup). Include
        // both active and soft-deleted apps: when soft-delete is disabled the
        // cascade from delete() bypasses the soft-delete step, so apps in the
        // space are still active at this point.
        if (this.appGenerateService) {
            const [deletedApps, activeApps] = await Promise.all([
                this.spaceModel.getAppsInSpace(spaceUuid, { deleted: true }),
                this.spaceModel.getAppsInSpace(spaceUuid),
            ]);
            for (const { appUuid, projectUuid } of [
                ...deletedApps,
                ...activeApps,
            ]) {
                // eslint-disable-next-line no-await-in-loop
                await this.appGenerateService.permanentDeleteApp(
                    user,
                    projectUuid,
                    appUuid,
                    { bypassPermissions: true },
                );
            }
        }

        await this.spaceModel.permanentDelete(spaceUuid);
    }

    async addSpaceUserAccess(
        user: SessionUser,
        spaceUuid: string,
        shareWithUserUuid: string,
        spaceRole: SpaceMemberRole,
    ): Promise<void> {
        if (
            !(await this.spacePermissionService.can('manage', user, spaceUuid))
        ) {
            throw new ForbiddenError();
        }

        await this.spaceModel.addSpaceAccess(
            spaceUuid,
            shareWithUserUuid,
            spaceRole,
        );
    }

    async removeSpaceUserAccess(
        user: SessionUser,
        spaceUuid: string,
        shareWithUserUuid: string,
    ): Promise<void> {
        if (
            !(await this.spacePermissionService.can('manage', user, spaceUuid))
        ) {
            throw new ForbiddenError();
        }

        await this.spaceModel.removeSpaceAccess(spaceUuid, shareWithUserUuid);
    }

    async addSpaceGroupAccess(
        user: SessionUser,
        spaceUuid: string,
        shareWithGroupUuid: string,
        spaceRole: SpaceMemberRole,
    ): Promise<void> {
        if (
            !(await this.spacePermissionService.can('manage', user, spaceUuid))
        ) {
            throw new ForbiddenError();
        }

        await this.spaceModel.addSpaceGroupAccess(
            spaceUuid,
            shareWithGroupUuid,
            spaceRole,
        );
    }

    async removeSpaceGroupAccess(
        user: SessionUser,
        spaceUuid: string,
        shareWithGroupUuid: string,
    ): Promise<void> {
        if (
            !(await this.spacePermissionService.can('manage', user, spaceUuid))
        ) {
            throw new ForbiddenError();
        }

        await this.spaceModel.removeSpaceGroupAccess(
            spaceUuid,
            shareWithGroupUuid,
        );
    }

    async togglePinning(user: SessionUser, spaceUuid: string): Promise<Space> {
        const existingSpace = await this.spaceModel.get(spaceUuid);
        const { projectUuid, organizationUuid, pinnedListUuid } = existingSpace;

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('PinnedItems', {
                    projectUuid,
                    organizationUuid,
                    metadata: { spaceUuid, spaceName: existingSpace.name },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (pinnedListUuid) {
            await this.pinnedListModel.deleteItem({
                pinnedListUuid,
                spaceUuid,
            });
        } else {
            await this.pinnedListModel.addItem({
                projectUuid,
                spaceUuid,
            });
        }

        const pinnedList = await this.pinnedListModel.getPinnedListAndItems(
            existingSpace.projectUuid,
        );

        this.analytics.track({
            event: 'pinned_list.updated',
            userId: user.userUuid,
            properties: {
                projectId: existingSpace.projectUuid,
                organizationId: existingSpace.organizationUuid,
                location: 'homepage',
                pinnedListId: pinnedList.pinnedListUuid,
                pinnedItems: pinnedList.items,
            },
        });

        return this.getSpace(projectUuid, user, spaceUuid);
    }

    /**
     * Filters search results (dashboards or charts) by space access permissions
     * @param user - The session user to check permissions for
     * @param searchResults - Array of search results with spaceUuid property
     * @returns Filtered array containing only items the user has access to
     */
    async filterBySpaceAccess<T extends { spaceUuid: string }>(
        user: SessionUser,
        searchResults: T[],
    ): Promise<T[]> {
        if (searchResults.length === 0) {
            return [];
        }

        // Get unique space UUIDs from search results
        const spaceUuids = [
            ...new Set(searchResults.map((item) => item.spaceUuid)),
        ];

        const accessibleSpaceUuids =
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                spaceUuids,
            );

        const accessibleSet = new Set(accessibleSpaceUuids);
        return searchResults.filter((item) =>
            accessibleSet.has(item.spaceUuid),
        );
    }
}
