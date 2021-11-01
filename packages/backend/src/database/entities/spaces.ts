import { Knex } from 'knex';
import { Space } from 'common';
import database from '../database';
import { NotFoundError } from '../../errors';

type DbSpace = {
    space_id: number;
    space_uuid: string;
    name: string;
    created_at: Date;
    project_id: number;
};

type CreateDbSpace = Pick<DbSpace, 'name' | 'project_id'>;

export type SpaceTable = Knex.CompositeTableType<DbSpace, CreateDbSpace>;
export const SpaceTableName = 'spaces';

export const getSpace = async (
    db: Knex,
    projectUuid: string,
): Promise<DbSpace> => {
    const results = await db('spaces')
        .innerJoin('projects', 'projects.project_id', 'spaces.project_id')
        .where('project_uuid', projectUuid)
        .select<DbSpace[]>('spaces.*')
        .limit(1);
    const [space] = results;
    if (space === undefined) {
        throw new NotFoundError(
            `No space found for project with id: ${projectUuid}`,
        );
    }
    return space;
};

export const getSpaceWithQueries = async (
    projectUuid: string,
): Promise<Space> => {
    const space = await getSpace(database, projectUuid);
    const savedQueries = await database('saved_queries')
        .select<{ saved_query_uuid: string; name: string }[]>([
            'saved_queries.saved_query_uuid',
            'saved_queries.name',
        ])
        .where('space_id', space.space_id);
    return {
        uuid: space.space_uuid,
        name: space.name,
        queries: savedQueries.map((savedQuery) => ({
            uuid: savedQuery.saved_query_uuid,
            name: savedQuery.name,
        })),
    };
};
