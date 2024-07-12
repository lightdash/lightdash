import {
    CreateSqlChart,
    generateSlug,
    NotFoundError,
    SqlChart,
    UpdateSqlChart,
} from '@lightdash/common';
import { SqlRunnerChartConfig } from '@lightdash/common/src/types/sqlRunner';
import { Knex } from 'knex';
import { customAlphabet } from 'nanoid';
import { DashboardsTableName } from '../database/entities/dashboards';
import {
    DbOrganization,
    OrganizationTableName,
} from '../database/entities/organizations';
import { DbProject, ProjectTableName } from '../database/entities/projects';
import {
    DbSavedSql,
    DbSavedSqlVersion,
    SavedSqlTableName,
    SavedSqlVersionsTableName,
} from '../database/entities/savedSql';
import { DbSpace, SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';

type SelectSavedSql = Pick<
    DbSavedSql,
    | 'saved_sql_uuid'
    | 'name'
    | 'description'
    | 'slug'
    | 'dashboard_uuid'
    | 'created_at'
    | 'created_by_user_uuid'
    | 'last_version_updated_at'
    | 'last_version_updated_by_user_uuid'
> &
    Pick<DbSavedSqlVersion, 'sql' | 'config' | 'chart_kind'> &
    Pick<DbSpace, 'space_uuid'> &
    Pick<DbProject, 'project_uuid'> &
    Pick<DbOrganization, 'organization_uuid'> & {
        updated_at: Date;
        spaceName: string;
        dashboardName: string | null;
        created_by_user_uuid: string | null;
        created_by_user_first_name: string | null;
        created_by_user_last_name: string | null;
        last_updated_by_user_uuid: string | null;
        last_updated_by_user_first_name: string | null;
        last_updated_by_user_last_name: string | null;
    };

export class SavedSqlModel {
    private database: Knex;

    constructor(args: { database: Knex }) {
        this.database = args.database;
    }

    static convertSelectSavedSql(row: SelectSavedSql): SqlChart {
        return {
            savedSqlUuid: row.saved_sql_uuid,
            name: row.name,
            description: row.description,
            slug: row.slug,
            createdAt: row.created_at,
            createdBy: row.created_by_user_uuid
                ? {
                      userUuid: row.created_by_user_uuid,
                      firstName: row.created_by_user_first_name ?? '',
                      lastName: row.created_by_user_last_name ?? '',
                  }
                : null,
            lastUpdatedAt: row.last_version_updated_at,
            lastUpdatedBy: row.last_updated_by_user_uuid
                ? {
                      userUuid: row.last_updated_by_user_uuid,
                      firstName: row.last_updated_by_user_first_name ?? '',
                      lastName: row.last_updated_by_user_last_name ?? '',
                  }
                : null,
            sql: row.sql,
            config: row.config as SqlRunnerChartConfig,
            chartKind: row.chart_kind,
            space: {
                uuid: row.space_uuid,
                name: row.spaceName,
            },
            project: {
                projectUuid: row.project_uuid,
            },
            dashboard: row.dashboard_uuid
                ? {
                      uuid: row.dashboard_uuid,
                      name: row.dashboardName ?? '',
                  }
                : null,
            organization: {
                organizationUuid: row.organization_uuid,
            },
        };
    }

    async find(options: {
        uuid?: string;
        slug?: string;
        projectUuid?: string;
    }) {
        return this.database
            .from(SavedSqlTableName)
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${SavedSqlTableName}.dashboard_uuid`,
            )
            .innerJoin(SpaceTableName, function spaceJoin() {
                this.on(
                    `${SpaceTableName}.space_id`,
                    '=',
                    `${DashboardsTableName}.space_id`,
                ).orOn(
                    `${SpaceTableName}.space_uuid`,
                    '=',
                    `${SavedSqlTableName}.space_uuid`,
                );
            })
            .innerJoin(
                ProjectTableName,
                `${SpaceTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .innerJoin(
                SavedSqlVersionsTableName,
                `${SavedSqlTableName}.saved_sql_uuid`,
                `${SavedSqlVersionsTableName}.saved_sql_uuid`,
            )
            .leftJoin(
                `${UserTableName} as createdByUser`,
                `${SavedSqlTableName}.created_by_user_uuid`,
                `createdByUser.user_uuid`,
            )
            .leftJoin(
                `${UserTableName} as updatedByUser`,
                `${SavedSqlTableName}.last_version_updated_by_user_uuid`,
                `updatedByUser.user_uuid`,
            )
            .select<SelectSavedSql[]>([
                `${ProjectTableName}.project_uuid`,
                `${SavedSqlTableName}.saved_sql_uuid`,
                `${SavedSqlTableName}.name`,
                `${SavedSqlTableName}.description`,
                `${SavedSqlTableName}.dashboard_uuid`,
                `${SavedSqlTableName}.created_at`,
                `${SavedSqlTableName}.slug`,
                `${SavedSqlTableName}.last_version_updated_at`,
                `${SavedSqlTableName}.last_version_updated_by_user_uuid`,
                `${DashboardsTableName}.name as dashboardName`,
                `${SavedSqlVersionsTableName}.sql`,
                `${SavedSqlVersionsTableName}.config`,
                `${SavedSqlVersionsTableName}.chart_kind`,
                `${OrganizationTableName}.organization_uuid`,
                `createdByUser.user_uuid`,
                `createdByUser.first_name`,
                `createdByUser.last_name`,
                `updatedByUser.user_uuid`,
                `updatedByUser.first_name`,
                `updatedByUser.last_name`,
                `${SpaceTableName}.space_uuid`,
                `${SpaceTableName}.name as spaceName`,
            ])
            .where((builder) => {
                if (options.uuid) {
                    void builder.where(
                        `${SavedSqlTableName}.saved_sql_uuid`,
                        options.uuid,
                    );
                }

                if (options.slug) {
                    void builder.where(
                        `${SavedSqlTableName}.slug`,
                        options.slug,
                    );
                }

                if (options.projectUuid) {
                    void builder.where(
                        `${ProjectTableName}.project_uuid`,
                        options.projectUuid,
                    );
                }

                // Required filter to join only the latest version
                void builder.where(
                    `${SavedSqlVersionsTableName}.created_at`,
                    '=',
                    this.database
                        .from(SavedSqlVersionsTableName)
                        .max('created_at')
                        .where(
                            `${SavedSqlVersionsTableName}.saved_sql_uuid`,
                            this.database.ref(
                                `${SavedSqlTableName}.saved_sql_uuid`,
                            ),
                        ),
                );
            })
            .orderBy(`${SavedSqlVersionsTableName}.created_at`, 'desc');
    }

    async getBySlug(projectUuid: string, slug: string) {
        const results = await this.find({ slug, projectUuid });
        const [result] = results;
        if (!result) {
            throw new NotFoundError('Saved sql not found');
        }
        return SavedSqlModel.convertSelectSavedSql(result);
    }

    async getByUuid(uuid: string, options: { projectUuid?: string }) {
        const results = await this.find({ uuid, ...options });
        const [result] = results;
        if (!result) {
            throw new NotFoundError('Saved sql not found');
        }
        return SavedSqlModel.convertSelectSavedSql(result);
    }

    static async createVersion(
        trx: Knex,
        data: {
            savedSqlUuid: string;
            userUuid: string;
            config: SqlRunnerChartConfig;
            sql: string;
        },
    ): Promise<string> {
        const [{ saved_sql_version_uuid: savedSqlVersionUuid }] = await trx(
            SavedSqlVersionsTableName,
        ).insert(
            {
                saved_sql_uuid: data.savedSqlUuid,
                sql: data.sql,
                config: data.config,
                chart_kind: data.config.type,
                created_by_user_uuid: data.userUuid,
            },
            ['saved_sql_version_uuid'],
        );
        await trx(SavedSqlTableName)
            .update({
                last_version_chart_kind: data.config.type,
                last_version_updated_at: new Date(),
                last_version_updated_by_user_uuid: data.userUuid,
            })
            .where('saved_sql_uuid', data.savedSqlUuid);
        return savedSqlVersionUuid;
    }

    static async generateSlug(trx: Knex, name: string) {
        let slug = generateSlug(name);
        const matchingSlugs: string[] = await trx(SavedSqlTableName)
            .select('slug')
            .where('slug', 'like', `${slug}%`)
            .pluck('slug');

        while (matchingSlugs.includes(slug)) {
            // generate a new slug with a random alphanumeric lowercase 4 character suffix
            slug = `${slug}-${customAlphabet(
                '0123456789abcdefghijklmnopqrstuvwxyz',
                4,
            )}`;
        }
        return slug;
    }

    async create(
        userUuid: string,
        projectUuid: string,
        data: CreateSqlChart,
    ): Promise<{
        savedSqlUuid: string;
        savedSqlVersionUuid: string;
    }> {
        return this.database.transaction(async (trx) => {
            const slug = await SavedSqlModel.generateSlug(trx, data.name);
            const [{ saved_sql_uuid: savedSqlUuid }] = await trx(
                SavedSqlTableName,
            ).insert(
                {
                    slug,
                    name: data.name,
                    description: data.description,
                    created_by_user_uuid: userUuid,
                    project_uuid: projectUuid,
                    space_uuid: data.spaceUuid,
                    dashboard_uuid: null,
                },
                ['saved_sql_uuid'],
            );
            const savedSqlVersionUuid = await SavedSqlModel.createVersion(trx, {
                savedSqlUuid,
                userUuid,
                config: data.config,
                sql: data.sql,
            });
            return { savedSqlUuid, savedSqlVersionUuid };
        });
    }

    async update(data: {
        userUuid: string;
        savedSqlUuid: string;
        sqlChart: UpdateSqlChart;
    }): Promise<{ savedSqlUuid: string; savedSqlVersionUuid: string | null }> {
        return this.database.transaction(async (trx) => {
            if (data.sqlChart.unversionedData) {
                await trx(SavedSqlTableName)
                    .update({
                        name: data.sqlChart.unversionedData.name,
                        description: data.sqlChart.unversionedData.description,
                        space_uuid: data.sqlChart.unversionedData.spaceUuid,
                    })
                    .where('saved_sql_uuid', data.savedSqlUuid);
            }

            let savedSqlVersionUuid: string | null = null;
            if (data.sqlChart.versionedData) {
                savedSqlVersionUuid = await SavedSqlModel.createVersion(trx, {
                    savedSqlUuid: data.savedSqlUuid,
                    userUuid: data.userUuid,
                    config: data.sqlChart.versionedData.config,
                    sql: data.sqlChart.versionedData.sql,
                });
            }

            return { savedSqlUuid: data.savedSqlUuid, savedSqlVersionUuid };
        });
    }

    async delete(uuid: string) {
        await this.database(SavedSqlTableName)
            .where('saved_sql_uuid', uuid)
            .delete();
    }
}
