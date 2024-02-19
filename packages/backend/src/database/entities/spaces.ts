import { ChartKind, NotFoundError, Space } from '@lightdash/common';
import { Knex } from 'knex';
import database from '../database';
import { AnalyticsChartViewsTableName } from './analytics';
import {
    DbPinnedList,
    DBPinnedSpace,
    PinnedChartTableName,
    PinnedListTableName,
    PinnedSpaceTableName,
} from './pinnedList';
import { ProjectTableName } from './projects';
import { SavedChartsTableName } from './savedCharts';
import { UserTableName } from './users';

export type DbSpace = {
    space_id: number;
    space_uuid: string;
    name: string;
    is_private: boolean;
    created_at: Date;
    project_id: number;
    organization_uuid: string;
    created_by_user_id?: number;
    search_vector: string;
};

export type CreateDbSpace = Pick<
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

export const getFirstAccessibleSpace = async (
    db: Knex,
    projectUuid: string,
    userUuid: string,
): Promise<
    DbSpace &
        Pick<DbPinnedList, 'pinned_list_uuid'> &
        Pick<DBPinnedSpace, 'order'>
> => {
    const space = await db('spaces')
        .innerJoin('projects', 'projects.project_id', 'spaces.project_id')
        .innerJoin(
            'organizations',
            'organizations.organization_id',
            'projects.organization_id',
        )
        .leftJoin(
            PinnedSpaceTableName,
            `${PinnedSpaceTableName}.space_uuid`,
            `${SpaceTableName}.space_uuid`,
        )
        .leftJoin(
            PinnedListTableName,
            `${PinnedListTableName}.pinned_list_uuid`,
            `${PinnedSpaceTableName}.pinned_list_uuid`,
        )
        .leftJoin(
            SpaceShareTableName,
            `${SpaceShareTableName}.space_id`,
            `${SpaceTableName}.space_id`,
        )
        .leftJoin(
            'users',
            `${SpaceShareTableName}.user_id`,
            `${UserTableName}.user_id`,
        )
        .where((q) => {
            q.where(`${UserTableName}.user_uuid`, userUuid).orWhere(
                `${SpaceTableName}.is_private`,
                false,
            );
        })
        .where(`${ProjectTableName}.project_uuid`, projectUuid)
        .select<
            (DbSpace &
                Pick<DbPinnedList, 'pinned_list_uuid'> &
                Pick<DBPinnedSpace, 'order'>)[]
        >([
            'spaces.space_id',
            'spaces.space_uuid',
            'spaces.name',
            'spaces.created_at',
            'spaces.project_id',
            'organizations.organization_uuid',
            `${PinnedListTableName}.pinned_list_uuid`,
            `${PinnedSpaceTableName}.order`,
        ])
        .first();

    if (space === undefined) {
        throw new NotFoundError(
            `No space found for project with id: ${projectUuid}`,
        );
    }

    return space;
};

export const getSpaceWithQueries = async (
    projectUuid: string,
    userUuid: string,
): Promise<Space> => {
    const space = await getFirstAccessibleSpace(
        database,
        projectUuid,
        userUuid,
    );
    const savedQueries = await database('saved_queries')
        .leftJoin(
            'users',
            'saved_queries.last_version_updated_by_user_uuid',
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
                pinned_list_uuid: string | null;
                order: number | null;
                chart_kind: ChartKind;
                views: string;
                first_viewed_at: Date | null;
            }[]
        >([
            `saved_queries.saved_query_uuid`,
            `saved_queries.name`,
            `saved_queries.description`,
            `saved_queries.last_version_updated_at`,
            `saved_queries.last_version_chart_kind`,
            `users.user_uuid`,
            `users.first_name`,
            `users.last_name`,
            `${PinnedListTableName}.pinned_list_uuid`,
            `${PinnedChartTableName}.order`,

            database.raw(
                `(SELECT COUNT('${AnalyticsChartViewsTableName}.chart_uuid') FROM ${AnalyticsChartViewsTableName} WHERE saved_queries.saved_query_uuid = ${AnalyticsChartViewsTableName}.chart_uuid) as views`,
            ),
            database.raw(
                `(SELECT ${AnalyticsChartViewsTableName}.timestamp FROM ${AnalyticsChartViewsTableName} WHERE saved_queries.saved_query_uuid = ${AnalyticsChartViewsTableName}.chart_uuid ORDER BY ${AnalyticsChartViewsTableName}.timestamp ASC LIMIT 1) as first_viewed_at`,
            ),
        ])
        .orderBy('saved_queries.last_version_updated_at', 'desc')
        .where('space_id', space.space_id);

    return {
        organizationUuid: space.organization_uuid,
        uuid: space.space_uuid,
        name: space.name,
        isPrivate: space.is_private,
        pinnedListUuid: space.pinned_list_uuid,
        pinnedListOrder: space.order,
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
            pinnedListOrder: savedQuery.order,
            chartType: savedQuery.chart_kind,
            views: parseInt(savedQuery.views, 10) || 0,
            firstViewedAt: savedQuery.first_viewed_at,
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
