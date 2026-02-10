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
} from '@lightdash/common';
import { Knex } from 'knex';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';
import { SpacePermissionService } from './SpacePermissionService';

type SpaceServiceArguments = {
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    pinnedListModel: PinnedListModel;
    featureFlagModel: FeatureFlagModel;
    spacePermissionService: SpacePermissionService;
};

export const hasDirectAccessToSpace = (
    user: SessionUser,
    space: Pick<SpaceSummary | Space, 'isPrivate' | 'access'>,
): boolean => {
    const userUuidsWithDirectAccess = (
        space.access as Array<string | SpaceShare>
    ).reduce<string[]>((acc, access) => {
        if (typeof access === 'string') {
            return [...acc, access];
        }
        if (access.hasDirectAccess) {
            return [...acc, access.userUuid];
        }
        return acc;
    }, []);

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

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly pinnedListModel: PinnedListModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly spacePermissionService: SpacePermissionService;

    constructor(args: SpaceServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.spaceModel = args.spaceModel;
        this.pinnedListModel = args.pinnedListModel;
        this.featureFlagModel = args.featureFlagModel;
        this.spacePermissionService = args.spacePermissionService;
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
        await this.spaceModel.deleteSpace(spaceUuid);
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
        const nestedPermissionsFlag = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.NestedSpacesPermissions,
        });
        const isNested = !(await this.spaceModel.isRootSpace(spaceUuid));
        if (isNested && !nestedPermissionsFlag.enabled) {
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
        const nestedPermissionsFlag = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.NestedSpacesPermissions,
        });
        const isNested = !(await this.spaceModel.isRootSpace(spaceUuid));
        if (isNested && !nestedPermissionsFlag.enabled) {
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
        const nestedPermissionsFlag = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.NestedSpacesPermissions,
        });
        const isNested = !(await this.spaceModel.isRootSpace(spaceUuid));
        if (isNested && !nestedPermissionsFlag.enabled) {
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
        const nestedPermissionsFlag = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.NestedSpacesPermissions,
        });
        const isNested = !(await this.spaceModel.isRootSpace(spaceUuid));
        if (isNested && !nestedPermissionsFlag.enabled) {
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
