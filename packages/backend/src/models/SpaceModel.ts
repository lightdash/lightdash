import { NotFoundError, Space, UpdateSpace } from '@lightdash/common';
import { Knex } from 'knex';
import {
    getSpaceWithQueries,
    SpaceTableName,
} from '../database/entities/spaces';

type Dependencies = {
    database: Knex;
};
export class SpaceModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async get(spaceUuid: string): Promise<Space> {
        const [row] = await this.database(SpaceTableName)
            .leftJoin('projects', 'projects.project_id', 'spaces.project_id')
            .leftJoin(
                'organizations',
                'organizations.organization_id',
                'projects.project_id',
            )
            .where('space_uuid', spaceUuid)
            .select<
                ({ name: string; space_uuid: string } & {
                    project_uuid: string;
                } & { organization_uuid: string })[]
            >('*');
        if (row === undefined)
            throw new NotFoundError(
                `space with spaceUuid ${spaceUuid} does not exist`,
            );

        return {
            organizationUuid: row.organization_uuid,
            name: row.name,
            queries: [],
            uuid: row.space_uuid,
            projectUuid: row.project_uuid,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    async getAllSpaces(projectUuid: string): Promise<Space[]> {
        const space = await getSpaceWithQueries(projectUuid);
        return [space];
    }

    async createSpace(projectUuid: string, name: string): Promise<Space> {
        const [project] = await this.database('projects')
            .select('project_id')
            .where('project_uuid', projectUuid);

        const [space] = await this.database(SpaceTableName)
            .insert({
                project_id: project.project_id,
                name,
            })
            .returning('*');

        return {
            organizationUuid: space.organization_uuid,
            name: space.name,
            queries: [],
            uuid: space.space_uuid,
            projectUuid,
        };
    }

    async deleteSpace(spaceUuid: string): Promise<void> {
        await this.database(SpaceTableName)
            .where('space_uuid', spaceUuid)
            .delete();
    }

    async update(spaceUuid: string, space: UpdateSpace): Promise<Space> {
        await this.database(SpaceTableName)
            .update<UpdateSpace>(space)
            .where('space_uuid', spaceUuid);
        return this.get(spaceUuid);
    }
}
