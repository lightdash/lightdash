import {
    ChartConfig,
    ChartType,
    getChartType,
    NotFoundError,
    Space,
} from '@lightdash/common';
import { Knex } from 'knex';
import database from '../database';
import { PinnedChartTableName, PinnedListTableName } from './pinnedList';
import { SavedChartsTableName } from './savedCharts';

export type DbSpace = {
    space_id: number;
    space_uuid: string;
    name: string;
    is_private: boolean;
    created_at: Date;
    project_id: number;
    organization_uuid: string;
    created_by_user_id?: number;
};

type CreateDbSpace = Pick<
    DbSpace,
    'name' | 'project_id' | 'is_private' | 'created_by_user_id'
>;

export type SpaceTable = Knex.CompositeTableType<DbSpace, CreateDbSpace>;
export const SpaceTableName = 'spaces';

export type DbSpaceShare = {
    space_id: number;
    user_id: number;
};

type CreateDbSpaceShare = Pick<DbSpaceShare, 'space_id' | 'user_id'>;

export type SpaceShareTable = Knex.CompositeTableType<
    DbSpaceShare,
    CreateDbSpaceShare
>;

export const SpaceShareTableName = 'space_share';

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
        .leftJoin(
            PinnedChartTableName,
            `${PinnedChartTableName}.saved_chart_uuid`,
            `${SavedChartsTableName}.saved_query_uuid`,
        )
        .leftJoin(
            PinnedListTableName,
            `${PinnedListTableName}.pinned_list_uuid`,
            `${PinnedChartTableName}.pinned_list_uuid`,
        )
        .select<
            {
                saved_query_uuid: string;
                name: string;
                description?: string;
                created_at: Date;
                user_uuid: string;
                first_name: string;
                last_name: string;
                pinned_list_uuid: string | undefined;
                chart_config: ChartConfig['config'];
                chart_type: ChartType;
                views: string;
            }[]
        >([
            `saved_queries.saved_query_uuid`,
            `saved_queries.name`,
            `saved_queries.description`,
            `saved_queries_versions.created_at`,
            `saved_queries_versions.chart_config`,
            `saved_queries_versions.chart_type`,
            `users.user_uuid`,
            `users.first_name`,
            `users.last_name`,
            `${PinnedListTableName}.pinned_list_uuid`,

            database.raw(
                `(SELECT COUNT('analytics_chart_views.chart_uuid') FROM analytics_chart_views WHERE saved_queries.saved_query_uuid = analytics_chart_views.chart_uuid) as views`,
            ),
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
        isPrivate: space.is_private,
        queries: savedQueries.map((savedQuery) => ({
            uuid: savedQuery.saved_query_uuid,
            name: savedQuery.name,
            description: savedQuery.description,
            updatedAt: savedQuery.created_at,
            updatedByUser: {
                userUuid: savedQuery.user_uuid,
                firstName: savedQuery.first_name,
                lastName: savedQuery.last_name,
            },
            spaceUuid: space.space_uuid,
            pinnedListUuid: savedQuery.pinned_list_uuid,
            chartType: getChartType(
                savedQuery.chart_type,
                savedQuery.chart_config,
            ),
            views: parseInt(savedQuery.views, 10) || 0,
        })),
        projectUuid,
        dashboards: [],
        access: [],
    };
};

export const getSpaceId = async (db: Knex, spaceUuid: string | undefined) => {
    if (spaceUuid === undefined) return undefined;

    const [space] = await db('spaces')
        .select('space_id')
        .where('space_uuid', spaceUuid);
    return space.space_id;
};
