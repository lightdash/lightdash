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

        return spaces.filter((space) =>
            user.ability.can(
                'view',
                subject('SavedChart', {
                    organizationUuid: space.organizationUuid,
                    projectUuid,
                }),
            ),
        );
    }

    async getSpace(
        projectUuid: string,
        user: SessionUser,
        spaceUuid: string,
    ): Promise<Space> {
        const space = await this.spaceModel.getWithQueriesAndDashboards(
            spaceUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid: space.organizationUuid,
                    projectUuid,
                }),
            )
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
                'manage',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const newSpace = await this.spaceModel.createSpace(
            projectUuid,
            space.name,
        );
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
        const space = await this.spaceModel.get(spaceUuid);
        if (
            user.ability.cannot(
                'manage',
                subject('Project', {
                    organizationUuid: space.organizationUuid,
                    projectUuid: space.projectUuid,
                }),
            )
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
        const space = await this.spaceModel.get(spaceUuid);
        if (
            user.ability.cannot(
                'manage',
                subject('Project', {
                    organizationUuid: space.organizationUuid,
                    projectUuid: space.projectUuid,
                }),
            )
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
