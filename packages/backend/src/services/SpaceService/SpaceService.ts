import { subject } from '@casl/ability';
import {
    CreateSpace,
    ForbiddenError,
    generateSlug,
    SessionUser,
    Space,
    SpaceMemberRole,
    SpaceShare,
    SpaceSummary,
    UpdateSpace,
} from '@lightdash/common';
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
export class SpaceService extends BaseService {
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
        const newSpace = await this.spaceModel.createSpace(
            projectUuid,
            space.name,
            user.userId,
            space.isPrivate !== false,
            generateSlug(space.name),
        );

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
            },
        });
        return updatedSpace;
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
