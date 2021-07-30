import { Knex } from 'knex';
import { Space } from 'common';
import database from '../database';

type DbSpace = {
    space_id: number;
    space_uuid: string;
    name: string;
    created_at: Date;
    project_id: number;
};

type CreateDbSpace = Pick<DbSpace, 'name' | 'project_id'>;

export const getSpace = async (db: Knex): Promise<DbSpace> => {
    const results = await db<DbSpace>('spaces').select<DbSpace[]>('*').limit(1);
    return results[0];
};

export const getSpaceWithQueries = async (): Promise<Space> => {
    const space = await getSpace(database);
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

export const createSpace = async (
    db: Knex,
    data: CreateDbSpace,
): Promise<DbSpace> => {
    const results = await db<DbSpace>('spaces')
        .insert<CreateDbSpace>(data)
        .returning('*');
    return results[0];
};
