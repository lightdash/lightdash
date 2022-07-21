import {
    DashboardBasicDetails,
    NotFoundError,
    Space,
    SpaceQuery,
    UpdateSpace,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DashboardsTableName,
    DashboardVersionsTableName,
} from '../database/entities/dashboards';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import { DbProject, ProjectTableName } from '../database/entities/projects';
import { DbSpace, SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { GetDashboardDetailsQuery } from './DashboardModel/DashboardModel';

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
            .select<(DbSpace & DbProject & DbOrganization)[]>([
                'spaces.space_uuid',
                'spaces.space_id',
                'spaces.name',
                'spaces.created_at',
                'projects.project_uuid',
                'organizations.organization_uuid',
            ]);
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
            dashboards: [],
        };
    }

    async getSpaceDashboards(
        spaceUuid: string,
    ): Promise<DashboardBasicDetails[]> {
        const dashboards = await this.database
            .table(DashboardsTableName)
            .leftJoin(
                SpaceTableName,
                `${DashboardsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .leftJoin(
                DashboardVersionsTableName,
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardVersionsTableName}.dashboard_id`,
            )
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${DashboardVersionsTableName}.updated_by_user_uuid`,
            )
            .innerJoin(
                ProjectTableName,
                `${SpaceTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${ProjectTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .select<GetDashboardDetailsQuery[]>([
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardsTableName}.name`,
                `${DashboardsTableName}.description`,
                `${ProjectTableName}.project_uuid`,
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${OrganizationTableName}.organization_uuid`,
            ])
            .where(`${SpaceTableName}.space_uuid`, spaceUuid);

        return dashboards.map(
            ({
                name,
                description,
                dashboard_uuid,
                created_at,
                project_uuid,
                user_uuid,
                first_name,
                last_name,
                organization_uuid,
            }) => ({
                organizationUuid: organization_uuid,
                name,
                description,
                uuid: dashboard_uuid,
                updatedAt: created_at,
                projectUuid: project_uuid,
                updatedByUser: {
                    userUuid: user_uuid,
                    firstName: first_name,
                    lastName: last_name,
                },
            }),
        );
    }

    async getSpaceQueries(spaceUuid: string): Promise<SpaceQuery[]> {
        const savedQueries = await this.database('saved_queries')
            .leftJoin(
                SpaceTableName,
                `saved_queries.space_id`,
                `${SpaceTableName}.space_id`,
            )
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
            .where(`${SpaceTableName}.space_uuid`, spaceUuid);
        return savedQueries.map((savedQuery) => ({
            uuid: savedQuery.saved_query_uuid,
            name: savedQuery.name,
            updatedAt: savedQuery.created_at,
            updatedByUser: {
                userUuid: savedQuery.user_uuid,
                firstName: savedQuery.first_name,
                lastName: savedQuery.last_name,
            },
        }));
    }

    // eslint-disable-next-line class-methods-use-this
    async getAllSpaces(projectUuid: string): Promise<Space[]> {
        const results = await this.database(SpaceTableName)
            .innerJoin('projects', 'projects.project_id', 'spaces.project_id')
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .where('project_uuid', projectUuid)
            .select<(DbSpace & DbProject & DbOrganization)[]>([
                'spaces.space_uuid',
                'spaces.name',
                'spaces.created_at',
                'projects.project_uuid',
                'organizations.organization_uuid',
            ]);
        return Promise.all(
            results.map(async (row) => ({
                organizationUuid: row.organization_uuid,
                name: row.name,
                queries: await this.getSpaceQueries(row.space_uuid),
                uuid: row.space_uuid,
                projectUuid: row.project_uuid,
                dashboards: await this.getSpaceDashboards(row.space_uuid),
            })),
        );
    }

    async getWithQueriesAndDashboards(spaceUuid: string): Promise<Space> {
        const space = await this.get(spaceUuid);
        return {
            organizationUuid: space.organizationUuid,
            name: space.name,
            uuid: space.uuid,
            projectUuid: space.projectUuid,
            queries: await this.getSpaceQueries(space.uuid),
            dashboards: await this.getSpaceDashboards(space.uuid),
        };
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
            dashboards: [],
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
