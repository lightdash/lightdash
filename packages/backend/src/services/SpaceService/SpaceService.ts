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

const hasSpaceAccess = (space: Space, userUuid: string): boolean => true;
// TODO enable this once UI for space access is done
// return space.access.find(userAccess => userAccess.userUuid === userUuid) !== undefined

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
        );

        this.spaceModel.addSpaceAccess(newSpace.uuid, user.userUuid);
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
}
