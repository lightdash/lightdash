import { subject } from '@casl/ability';
import {
    CreateSpace,
    ForbiddenError,
    SessionUser,
    Space,
    UpdateSpace,
} from '@lightdash/common';
import { analytics } from '../../analytics/client';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SpaceModel } from '../../models/SpaceModel';

type Dependencies = {
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
};

export const hasSpaceAccess = (space: Space, userUuid: string): boolean =>
    !space.isPrivate ||
    space.access.find(
        (userAccess) =>
            userAccess.userUuid === userUuid && userAccess.role !== null,
    ) !== undefined;

export class SpaceService {
    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    constructor(dependencies: Dependencies) {
        this.projectModel = dependencies.projectModel;
        this.spaceModel = dependencies.spaceModel;
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
                ) && hasSpaceAccess(space, user.userUuid),
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
            !hasSpaceAccess(space, user.userUuid)
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
        const { organizationUuid } = await this.projectModel.get(projectUuid);
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
            space.isPrivate,
        );

        space.access.map(async (access) => {
            await this.spaceModel.addSpaceAccess(
                newSpace.uuid,
                access.userUuid,
            );
        });
        await this.spaceModel.addSpaceAccess(newSpace.uuid, user.userUuid);
        analytics.track({
            event: 'space.created',
            userId: user.userUuid,
            properties: {
                name: space.name,
                spaceId: newSpace.uuid,
                projectId: projectUuid,
            },
        });
        return newSpace;
    }

    async updateSpace(
        user: SessionUser,
        spaceUuid: string,
        updateSpace: UpdateSpace,
    ): Promise<Space> {
        const space = await this.spaceModel.getFullSpace(spaceUuid);
        if (
            user.ability.cannot(
                'manage',
                subject('Space', {
                    organizationUuid: space.organizationUuid,
                    projectUuid: space.projectUuid,
                }),
            ) ||
            !hasSpaceAccess(space, user.userUuid)
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
        analytics.track({
            event: 'space.updated',
            userId: user.userUuid,
            properties: {
                name: space.name,
                spaceId: spaceUuid,
                projectId: space.projectUuid,
            },
        });
        return updatedSpace;
    }

    async deleteSpace(user: SessionUser, spaceUuid: string): Promise<void> {
        const space = await this.spaceModel.getFullSpace(spaceUuid);
        if (
            user.ability.cannot(
                'delete',
                subject('Space', {
                    organizationUuid: space.organizationUuid,
                    projectUuid: space.projectUuid,
                }),
            ) ||
            !hasSpaceAccess(space, user.userUuid)
        ) {
            throw new ForbiddenError();
        }

        await this.spaceModel.deleteSpace(spaceUuid);
        analytics.track({
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
        const space = await this.spaceModel.getFullSpace(spaceUuid);
        if (
            user.ability.cannot(
                'manage',
                subject('Space', {
                    organizationUuid: space.organizationUuid,
                    projectUuid: space.projectUuid,
                }),
            ) ||
            !hasSpaceAccess(space, user.userUuid)
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
        const space = await this.spaceModel.getFullSpace(spaceUuid);
        if (
            user.ability.cannot(
                'manage',
                subject('Space', {
                    organizationUuid: space.organizationUuid,
                    projectUuid: space.projectUuid,
                }),
            ) ||
            !hasSpaceAccess(space, user.userUuid)
        ) {
            throw new ForbiddenError();
        }

        if (
            space.access.filter(
                (userAccess) => userAccess.userUuid !== shareWithUserUuid,
            ).length === 0
        ) {
            throw new Error('There must be at least 1 user in this space');
        }

        await this.spaceModel.removeSpaceAccess(spaceUuid, shareWithUserUuid);
    }
}
