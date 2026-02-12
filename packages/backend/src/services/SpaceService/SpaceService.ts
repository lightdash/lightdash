import { subject } from '@casl/ability';
import {
    AbilityAction,
    BulkActionable,
    CreateSpace,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    SessionUser,
    Space,
    SpaceMemberRole,
    SpaceShare,
    SpaceSummary,
    UpdateSpace,
    type SpaceAccess,
} from '@lightdash/common';
import { Knex } from 'knex';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';
import type { DashboardService } from '../DashboardService/DashboardService';
import type { SavedChartService } from '../SavedChartsService/SavedChartService';
import { SpacePermissionService } from './SpacePermissionService';

type SpaceServiceArguments = {
    analytics: LightdashAnalytics;
    lightdashConfig: LightdashConfig;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    pinnedListModel: PinnedListModel;
    featureFlagModel: FeatureFlagModel;
    spacePermissionService: SpacePermissionService;
    savedChartService: SavedChartService;
    dashboardService: DashboardService;
};

export const hasDirectAccessToSpace = (
    user: SessionUser,
    space:
        | Pick<SpaceSummary, 'isPrivate' | 'access'>
        | {
              isPrivate: boolean;
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

    const hasAccess =
        !space.isPrivate || userUuidsWithDirectAccess?.includes(user.userUuid);

    return hasAccess;
};

export const hasViewAccessToSpace = (
    user: SessionUser,
    space: Pick<
        Space | SpaceSummary,
        'projectUuid' | 'organizationUuid' | 'isPrivate'
    >,
    access: SpaceShare[],
): boolean =>
    user.ability.can(
        'view',
        subject('Space', {
            organizationUuid: space.organizationUuid,
            projectUuid: space.projectUuid,
            isPrivate: space.isPrivate,
            access,
        }),
    );

export class SpaceService extends BaseService implements BulkActionable<Knex> {
    private readonly analytics: LightdashAnalytics;

    private readonly lightdashConfig: LightdashConfig;

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly pinnedListModel: PinnedListModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly savedChartService: SavedChartService;

    private readonly dashboardService: DashboardService;

    constructor(args: SpaceServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.lightdashConfig = args.lightdashConfig;
        this.projectModel = args.projectModel;
        this.spaceModel = args.spaceModel;
        this.pinnedListModel = args.pinnedListModel;
        this.featureFlagModel = args.featureFlagModel;
        this.spacePermissionService = args.spacePermissionService;
        this.savedChartService = args.savedChartService;
        this.dashboardService = args.dashboardService;
    }

    /** @internal For unit testing only */
    async _userCanActionSpace(
        user: Pick<SessionUser, 'ability' | 'userUuid'>,
        contentType: 'Space' | 'Dashboard' | 'Chart',
        space: Pick<
            SpaceSummary,
            'organizationUuid' | 'projectUuid' | 'isPrivate' | 'uuid'
        >,
        action: AbilityAction,
        logDiagnostics: boolean = false,
        options: { useInheritedAccess: boolean } = {
            useInheritedAccess: false,
        },
    ): Promise<boolean> {
        const userAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            space.uuid,
            options,
        );
        const ss = subject(contentType, {
            organizationUuid: space.organizationUuid,
            projectUuid: space.projectUuid,
            isPrivate: space.isPrivate,
            access: userAccess,
        });
        if (logDiagnostics) {
            const rule = user.ability.relevantRuleFor(action, ss);
            console.log('action 👇');
            console.log(action);
            console.log('subject 👇');
            console.log(ss);
            console.log('rule 👇');
            console.log(rule);
            console.log(rule?.conditions);
        }

        return user.ability.can(action, ss);
    }

    async getSpace(
        projectUuid: string,
        user: SessionUser,
        spaceUuid: string,
    ): Promise<Space> {
        if (!(await this.spacePermissionService.can('view', user, spaceUuid))) {
            throw new ForbiddenError();
        }

        return this.spaceModel.getFullSpace(spaceUuid);
    }

    async createSpace(
        projectUuid: string,
        user: SessionUser,
        space: CreateSpace,
    ): Promise<Space> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        if (
            user.ability.cannot(
                'create',
                subject('Space', { organizationUuid, projectUuid }),
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

        // you can either set isPrivate or inheritParentPermissions while we temporarily
        // support both. Keeping the other property in sync in the meantime.
        let { isPrivate, inheritParentPermissions } = space;
        if (inheritParentPermissions !== undefined) {
            isPrivate = !inheritParentPermissions;
        } else if (isPrivate !== undefined) {
            inheritParentPermissions = !isPrivate;
        } else if (space.parentSpaceUuid) {
            isPrivate = false;
            inheritParentPermissions = true;
        } else {
            isPrivate = true;
            inheritParentPermissions = false;
        }

        const newSpace = await this.spaceModel.createSpace(
            {
                name: space.name,
                isPrivate,
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
                isPrivate: newSpace.isPrivate,
                userAccessCount: space.access?.length ?? 0,
                isNested: !!space.parentSpaceUuid,
            },
        });
        return newSpace;
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

        // TODO: legacy nested space check. How do we migrate this?
        const isNested = !(await this.spaceModel.isRootSpace(spaceUuid));
        if (isNested && 'isPrivate' in updateSpace) {
            throw new ForbiddenError(`Can't change privacy for a nested space`);
        }

        // you can either set isPrivate or inheritParentPermissions while we temporarily
        // support both. Keeping the other property in sync in the meantime.
        let { isPrivate, inheritParentPermissions } = updateSpace;
        if (inheritParentPermissions !== undefined) {
            isPrivate = !inheritParentPermissions;
        } else if (isPrivate !== undefined) {
            inheritParentPermissions = !isPrivate;
        }

        const updatedSpace = await this.spaceModel.update(spaceUuid, {
            ...updateSpace,
            isPrivate,
            inheritParentPermissions,
        });
        this.analytics.track({
            event: 'space.updated',
            userId: user.userUuid,
            properties: {
                name: space.name,
                spaceId: spaceUuid,
                projectId: space.projectUuid,
                isPrivate: space.isPrivate,
                userAccessCount: space.access.length,
                isNested,
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

    async deleteSpace(user: SessionUser, spaceUuid: string): Promise<void> {
        if (
            !(await this.spacePermissionService.can('delete', user, spaceUuid))
        ) {
            throw new ForbiddenError();
        }

        const space = await this.spaceModel.getSpaceSummary(spaceUuid);

        if (this.lightdashConfig.softDelete.enabled) {
            // Get all content UUIDs BEFORE soft-deleting
            const chartUuids =
                await this.spaceModel.getChartUuidsInSpace(spaceUuid);
            const dashboardUuids =
                await this.spaceModel.getDashboardUuidsInSpace(spaceUuid);
            const childSpaceUuids =
                await this.spaceModel.getChildSpaceUuids(spaceUuid);

            // Soft-delete charts (this cascades to schedulers via SavedChartService)
            for (const chartUuid of chartUuids) {
                // eslint-disable-next-line no-await-in-loop
                await this.savedChartService.delete(user, chartUuid);
            }

            // Soft-delete dashboards (this cascades to dashboard-scoped charts and schedulers)
            for (const dashboardUuid of dashboardUuids) {
                // eslint-disable-next-line no-await-in-loop
                await this.dashboardService.delete(user, dashboardUuid);
            }

            // Recursively soft-delete child spaces (calling deleteSpace recursively)
            for (const childSpaceUuid of childSpaceUuids) {
                // eslint-disable-next-line no-await-in-loop
                await this.deleteSpace(user, childSpaceUuid);
            }

            // Finally soft-delete the space itself
            await this.spaceModel.softDelete(spaceUuid, user.userUuid);
        } else {
            await this.spaceModel.permanentDelete(spaceUuid);
        }

        this.analytics.track({
            event: 'space.deleted',
            userId: user.userUuid,
            properties: {
                name: space.name,
                spaceId: spaceUuid,
                projectId: space.projectUuid,
                isNested: !!space.parentSpaceUuid,
            },
        });
    }

    async restoreSpace(user: SessionUser, spaceUuid: string): Promise<void> {
        const space = await this.spaceModel.getSpaceSummary(spaceUuid, {
            deleted: true,
        });

        // Permission check
        const isAdmin = user.ability.can(
            'manage',
            subject('DeletedContent', {
                organizationUuid: space.organizationUuid,
                projectUuid: space.projectUuid,
            }),
        );

        if (!isAdmin && space.deletedBy?.userUuid !== user.userUuid) {
            throw new ForbiddenError(
                'You can only restore content you deleted',
            );
        }

        // Restore the space first
        await this.spaceModel.restore(spaceUuid);

        // Get and restore charts that were cascade-deleted (same user)
        if (space.deletedBy?.userUuid) {
            const deletedChartUuids =
                await this.spaceModel.getChartUuidsInSpace(spaceUuid, {
                    deleted: true,
                    deletedByUserUuid: space.deletedBy.userUuid,
                });
            for (const chartUuid of deletedChartUuids) {
                // eslint-disable-next-line no-await-in-loop
                await this.savedChartService.restoreChart(user, chartUuid);
            }

            // Get and restore dashboards that were cascade-deleted (same user)
            const deletedDashboardUuids =
                await this.spaceModel.getDashboardUuidsInSpace(spaceUuid, {
                    deleted: true,
                    deletedByUserUuid: space.deletedBy.userUuid,
                });
            for (const dashboardUuid of deletedDashboardUuids) {
                // eslint-disable-next-line no-await-in-loop
                await this.dashboardService.restoreDashboard(
                    user,
                    dashboardUuid,
                );
            }

            // Restore child spaces that were cascade-deleted (same user)
            const deletedChildSpaceUuids =
                await this.spaceModel.getChildSpaceUuids(spaceUuid, {
                    deleted: true,
                    deletedByUserUuid: space.deletedBy.userUuid,
                });
            for (const childSpaceUuid of deletedChildSpaceUuids) {
                // eslint-disable-next-line no-await-in-loop
                await this.restoreSpace(user, childSpaceUuid);
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

    async permanentlyDeleteSpace(
        user: SessionUser,
        spaceUuid: string,
    ): Promise<void> {
        const space = await this.spaceModel.getSpaceSummary(spaceUuid, {
            deleted: true,
        });

        if (
            user.ability.cannot(
                'manage',
                subject('DeletedContent', {
                    organizationUuid: space.organizationUuid,
                    projectUuid: space.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.spaceModel.permanentDelete(spaceUuid);

        this.analytics.track({
            event: 'space.permanently_deleted',
            userId: user.userUuid,
            properties: {
                name: space.name,
                spaceId: spaceUuid,
                projectId: space.projectUuid,
            },
        });
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

        // Nested Spaces MVP - disables nested spaces' access changes when feature flag is off

        const isNested = !(await this.spaceModel.isRootSpace(spaceUuid));
        if (isNested) {
            throw new ForbiddenError(
                `Can't change user access to a nested space`,
            );
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

        // Nested Spaces MVP - disables nested spaces' access changes when feature flag is off
        const isNested = !(await this.spaceModel.isRootSpace(spaceUuid));
        if (isNested) {
            throw new ForbiddenError(
                `Can't change user access to a nested space`,
            );
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

        // Nested Spaces MVP - disables nested spaces' access changes when feature flag is off
        const isNested = !(await this.spaceModel.isRootSpace(spaceUuid));
        if (isNested) {
            throw new ForbiddenError(
                `Can't change group access to a nested space`,
            );
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

        // Nested Spaces MVP - disables nested spaces' access changes when feature flag is off
        const isNested = !(await this.spaceModel.isRootSpace(spaceUuid));
        if (isNested) {
            throw new ForbiddenError(
                `Can't change group access to a nested space`,
            );
        }

        await this.spaceModel.removeSpaceGroupAccess(
            spaceUuid,
            shareWithGroupUuid,
        );
    }

    async togglePinning(user: SessionUser, spaceUuid: string): Promise<Space> {
        const existingSpace = await this.spaceModel.get(spaceUuid);
        const { projectUuid, organizationUuid, pinnedListUuid } = existingSpace;

        if (
            user.ability.cannot(
                'manage',
                subject('PinnedItems', { projectUuid, organizationUuid }),
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
