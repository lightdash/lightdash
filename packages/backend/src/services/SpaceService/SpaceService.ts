import { subject } from '@casl/ability';
import {
    AbilityAction,
    BulkActionable,
    CreateSpace,
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
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';

type SpaceServiceArguments = {
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    pinnedListModel: PinnedListModel;
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

    constructor(args: SpaceServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.spaceModel = args.spaceModel;
        this.pinnedListModel = args.pinnedListModel;
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
    ): Promise<boolean> {
        const userAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            space.uuid,
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
        const space = await this.spaceModel.getFullSpace(spaceUuid);

        if (
            user.ability.cannot(
                'view',
                subject('Space', {
                    organizationUuid: space.organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access: space.access,
                }),
            ) // admins can also view private spaces
        ) {
            throw new ForbiddenError();
        }

        return space;
    }

    async createSpace(
        projectUuid: string,
        user: SessionUser,
        space: CreateSpace,
    ): Promise<Space> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

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

        const newSpace = await this.spaceModel.createSpace(
            {
                name: space.name,
                isPrivate: space.isPrivate !== false,
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
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const userSpaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            spaceUuid,
        );
        // Nested Spaces MVP - disables nested spaces' access changes
        const isNested = !(await this.spaceModel.isRootSpace(spaceUuid));
        if (isNested && 'isPrivate' in updateSpace) {
            throw new ForbiddenError(`Can't change privacy for a nested space`);
        }
        if (
            user.ability.cannot(
                'manage',
                subject('Space', {
                    ...space,
                    access: userSpaceAccess,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const updatedSpace = await this.spaceModel.update(
            spaceUuid,
            updateSpace,
        );
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
        const space = await this.spaceModel.getSpaceSummary(resource.spaceUuid);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            actor.user.userUuid,
            space.parentSpaceUuid ?? resource.spaceUuid,
        );

        const isActorAllowedToPerformAction = actor.user.ability.can(
            action,
            subject('Space', {
                organizationUuid: actor.user.organizationUuid,
                projectUuid: actor.projectUuid,
                isPrivate: space.isPrivate,
                access: spaceAccess,
            }),
        );

        if (!isActorAllowedToPerformAction) {
            throw new ForbiddenError(
                `You don't have access to ${action} this space`,
            );
        }

        if (resource.targetSpaceUuid) {
            const newSpace = await this.spaceModel.getSpaceSummary(
                resource.targetSpaceUuid,
            );
            const newSpaceAccess = await this.spaceModel.getUserSpaceAccess(
                actor.user.userUuid,
                resource.targetSpaceUuid,
            );

            const isActorAllowedToPerformActionInNewSpace =
                actor.user.ability.can(
                    action,
                    subject('Space', {
                        organizationUuid: newSpace.organizationUuid,
                        projectUuid: actor.projectUuid,
                        isPrivate: newSpace.isPrivate,
                        access: newSpaceAccess,
                    }),
                );

            if (!isActorAllowedToPerformActionInNewSpace) {
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
                `Space "${spaceUuid}" is already in the current space "${targetSpaceUuid}"`,
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
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            spaceUuid,
        );
        if (
            user.ability.cannot(
                'delete',
                subject('Space', {
                    ...space,
                    access: spaceAccess,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

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
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            spaceUuid,
        );
        // Nested Spaces MVP - disables nested spaces' access changes
        const isNested = !(await this.spaceModel.isRootSpace(spaceUuid));
        if (isNested) {
            throw new ForbiddenError(
                `Can't change user access to a nested space`,
            );
        }
        if (
            user.ability.cannot(
                'manage',
                subject('Space', {
                    ...space,
                    access: spaceAccess,
                }),
            )
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
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            spaceUuid,
        );
        // Nested Spaces MVP - disables nested spaces' access changes
        const isNested = !(await this.spaceModel.isRootSpace(spaceUuid));
        if (isNested) {
            throw new ForbiddenError(
                `Can't change user access to a nested space`,
            );
        }
        if (
            user.ability.cannot(
                'manage',
                subject('Space', {
                    ...space,
                    access: spaceAccess,
                }),
            )
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
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            spaceUuid,
        );
        // Nested Spaces MVP - disables nested spaces' access changes
        const isNested = !(await this.spaceModel.isRootSpace(spaceUuid));
        if (isNested) {
            throw new ForbiddenError(
                `Can't change group access to a nested space`,
            );
        }
        if (
            user.ability.cannot(
                'manage',
                subject('Space', {
                    ...space,
                    access: spaceAccess,
                }),
            )
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
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        const spaceAccess = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            spaceUuid,
        );
        // Nested Spaces MVP - disables nested spaces' access changes
        const isNested = !(await this.spaceModel.isRootSpace(spaceUuid));
        if (isNested) {
            throw new ForbiddenError(
                `Can't change group access to a nested space`,
            );
        }
        if (
            user.ability.cannot(
                'manage',
                subject('Space', {
                    ...space,
                    access: spaceAccess,
                }),
            )
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
}
