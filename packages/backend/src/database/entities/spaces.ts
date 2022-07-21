import { NotFoundError, Space } from '@lightdash/common';
import { Knex } from 'knex';
import database from '../database';

export type DbSpace = {
    space_id: number;
    space_uuid: string;
    name: string;
    created_at: Date;
    project_id: number;
    organization_uuid: string;
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
        .innerJoin(
            'organizations',
            'organizations.organization_id',
            'projects.organization_id',
        )
        .where('project_uuid', projectUuid)
        .select<DbSpace[]>([
            'spaces.space_id',
            'spaces.space_uuid',
            'spaces.name',
            'spaces.created_at',
            'spaces.project_id',
            'organizations.organization_uuid',
        ])
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
        .leftJoin(
            'saved_queries_versions',
            `saved_queries.saved_query_id`,
            `saved_queries_versions.saved_query_id`,
        )
        .leftJoin(
            'users',
            'saved_queries_versions.updated_by_user_uuid',
            'users.user_uuid',
        )
        .select<
            {
                saved_query_uuid: string;
                name: string;
                created_at: Date;
                user_uuid: string;
                first_name: string;
                last_name: string;
            }[]
        >([
            `saved_queries.saved_query_uuid`,
            `saved_queries.name`,
            `saved_queries_versions.created_at`,
            `users.user_uuid`,
            `users.first_name`,
            `users.last_name`,
        ])
        .orderBy([
            {
                column: `saved_queries_versions.saved_query_id`,
            },
            {
                column: `saved_queries_versions.created_at`,
                order: 'desc',
            },
        ])
        .distinctOn(`saved_queries_versions.saved_query_id`)
        .where('space_id', space.space_id);
    return {
        organizationUuid: space.organization_uuid,
        uuid: space.space_uuid,
        name: space.name,
        queries: savedQueries.map((savedQuery) => ({
            uuid: savedQuery.saved_query_uuid,
            name: savedQuery.name,
            updatedAt: savedQuery.created_at,
            updatedByUser: {
                userUuid: savedQuery.user_uuid,
                firstName: savedQuery.first_name,
                lastName: savedQuery.last_name,
            },
        })),
        projectUuid,
    };
};

export const getSpaceId = async (db: Knex, spaceUuid: string | undefined) => {
    if (spaceUuid === undefined) return undefined;

    const [space] = await db('spaces')
        .select('space_id')
        .where('space_uuid', spaceUuid);
    return space.space_id;
};
