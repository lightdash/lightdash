import { subject } from '@casl/ability';
import {
    CreateSpace,
    ForbiddenError,
    SessionUser,
    Space,
    SpaceShare,
    SpaceSummary,
    UpdateSpace,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { PinnedListModel } from '../../models/PinnedListModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SpaceModel } from '../../models/SpaceModel';

type SpaceServiceArguments = {
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    pinnedListModel: PinnedListModel;
};

export const hasSpaceAccess = (
    user: SessionUser,
    space: Pick<
        SpaceSummary | Space,
        'isPrivate' | 'access' | 'organizationUuid' | 'projectUuid'
    >,
    checkAdminAccess: boolean = true,
): boolean => {
    const hasAdminAccess = user.ability.can(
        'manage',
        subject('Project', {
            organizationUuid: space.organizationUuid,
            projectUuid: space.projectUuid,
        }),
    );
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

    return checkAdminAccess ? hasAdminAccess || hasAccess : hasAccess;
};

export class SpaceService {
    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly pinnedListModel: PinnedListModel;

    constructor(args: SpaceServiceArguments) {
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.spaceModel = args.spaceModel;
        this.pinnedListModel = args.pinnedListModel;
    }

    async getAllSpaces(
        projectUuid: string,
        user: SessionUser,
    ): Promise<Space[]> {
        const spaces = await this.spaceModel.getAllSpaces(projectUuid);
        return spaces.filter(
            (space) =>
                user.ability.can(
                    'view',
                    subject('SavedChart', {
                        organizationUuid: space.organizationUuid,
                        projectUuid,
                    }),
                ) && hasSpaceAccess(user, space, false),
        );
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
                }),
            ) ||
            !hasSpaceAccess(user, space, true) // admins can also view private spaces
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
        const newSpace = await this.spaceModel.createSpace(
            projectUuid,
            space.name,
            user.userId,
            space.isPrivate !== false,
        );

        if (space.access)
            await Promise.all(
                space.access.map((access) =>
                    this.spaceModel.addSpaceAccess(
                        newSpace.uuid,
                        access.userUuid,
                    ),
                ),
            );
        await this.spaceModel.addSpaceAccess(newSpace.uuid, user.userUuid);
        this.analytics.track({
            event: 'space.created',
            userId: user.userUuid,
            properties: {
                name: space.name,
                spaceId: newSpace.uuid,
                projectId: projectUuid,
                isPrivate: newSpace.isPrivate,
                userAccessCount: space.access?.length ?? 0,
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
        if (
            user.ability.cannot(
                'manage',
                subject('Space', {
                    organizationUuid: space.organizationUuid,
                    projectUuid: space.projectUuid,
                }),
            ) ||
            !hasSpaceAccess(user, space, true)
        ) {
            throw new ForbiddenError();
        }

        if (space.isPrivate !== updateSpace.isPrivate) {
            // Switching public and private spaces switches between their defaults
            // it will remove access to all users except for this `user.userUuid`

            await this.spaceModel.clearSpaceAccess(spaceUuid, user.userUuid);
            await this.spaceModel.addSpaceAccess(spaceUuid, user.userUuid);
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
            },
        });
        return updatedSpace;
    }

    async deleteSpace(user: SessionUser, spaceUuid: string): Promise<void> {
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        if (
            user.ability.cannot(
                'delete',
                subject('Space', {
                    organizationUuid: space.organizationUuid,
                    projectUuid: space.projectUuid,
                }),
            ) ||
            !hasSpaceAccess(user, space, true)
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
            },
        });
    }

    async addSpaceShare(
        user: SessionUser,
        spaceUuid: string,
        shareWithUserUuid: string,
    ): Promise<void> {
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        if (
            user.ability.cannot(
                'manage',
                subject('Space', {
                    organizationUuid: space.organizationUuid,
                    projectUuid: space.projectUuid,
                }),
            ) ||
            !hasSpaceAccess(user, space, true)
        ) {
            throw new ForbiddenError();
        }

        await this.spaceModel.addSpaceAccess(spaceUuid, shareWithUserUuid);
    }

    async removeSpaceShare(
        user: SessionUser,
        spaceUuid: string,
        shareWithUserUuid: string,
    ): Promise<void> {
        const space = await this.spaceModel.getSpaceSummary(spaceUuid);
        if (
            user.ability.cannot(
                'manage',
                subject('Space', {
                    organizationUuid: space.organizationUuid,
                    projectUuid: space.projectUuid,
                }),
            ) ||
            !hasSpaceAccess(user, space, true)
        ) {
            throw new ForbiddenError();
        }

        if (
            space.access.filter((userUuid) => userUuid !== shareWithUserUuid)
                .length === 0
        ) {
            throw new Error('There must be at least 1 user in this space');
        }

        await this.spaceModel.removeSpaceAccess(spaceUuid, shareWithUserUuid);
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
