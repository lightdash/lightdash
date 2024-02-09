import { CreateSqlRun, NotFoundError, SqlRun } from '@lightdash/common';
import { Knex } from 'knex';
import { SqlRunTableName } from '../database/entities/sqlRun';

type SqlRunModelDependencies = {
    database: Knex;
};

export class SqlRunModel {
    database: Knex;

    constructor({ database }: SqlRunModelDependencies) {
        this.database = database;
    }

    async create(createSqlRun: CreateSqlRun): Promise<SqlRun> {
        // const orgQuery = this.database('organizations')
        //     .select('organization_id')
        //     .where('organization_uuid', createSqlRun.createdByOrganizationUuid);
        // const userQuery = this.database('users')
        //     .select('user_id')
        //     .where('user_uuid', createSqlRun.createdByUserUuid);
        // const [row] = await this.database(SqlRunTableName).insert(
        //     {
        //         sql: createSqlRun.sql,
        //         project_uuid: createSqlRun.projectUuid,
        //         created_by_organization_id: orgQuery,
        //         created_by_user_id: userQuery,
        //         results_preview: createSqlRun.resultsPreview,
        //         target_database: createSqlRun.targetDatabase,
        //     },
        //     ['*'],
        // );
        // Sorry Jose I just can't get this to work
        const results = await this.database.raw(
            `
                INSERT INTO sql_run_history (sql, project_uuid, created_by_organization_id, created_by_user_id,
                                             results_preview, target_database)
                VALUES (?, ?, (select organization_id from organizations where organization_uuid = ?),
                        (select user_id from users where user_uuid = ?), ?, ?)
                RETURNING *
            `,
            [
                createSqlRun.sql,
                createSqlRun.projectUuid,
                createSqlRun.createdByOrganizationUuid,
                createSqlRun.createdByUserUuid,
                createSqlRun.resultsPreview,
                createSqlRun.targetDatabase,
            ],
        );
        const {
            rows: [row],
        } = results;
        return {
            sqlRunUuid: row.sql_run_uuid,
            sql: row.sql,
            projectUuid: row.project_uuid,
            createdByOrganizationUuid:
                row.created_by_organization_id ?? undefined,
            createdByUserUuid: row.created_by_user_id ?? undefined,
            resultsPreview: row.results_preview,
            createdAt: row.created_at,
            targetDatabase: row.target_database,
        };
    }

    async getByUuid(uuid: string): Promise<SqlRun> {
        const row = await this.database(SqlRunTableName)
            .select<any>('*')
            .innerJoin('organization_memberships', (builder) => {
                builder
                    .on(
                        'organization_memberships.organization_id',
                        '=',
                        'sql_run_history.created_by_organization_id',
                    )
                    .andOn(
                        'organization_memberships.user_id',
                        '=',
                        'sql_run_history.created_by_user_id',
                    );
            })
            .innerJoin(
                'users',
                'users.user_id',
                'organization_memberships.user_id',
            )
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'organization_memberships.organization_id',
            )
            .where('sql_run_uuid', uuid)
            .first();
        if (row === undefined) {
            throw new NotFoundError(
                `Cannot find sql history entry with id: ${uuid}`,
            );
        }
        return {
            sqlRunUuid: row.sql_run_uuid,
            sql: row.sql,
            projectUuid: row.project_uuid,
            createdByOrganizationUuid: row.organization_uuid ?? undefined,
            createdByUserUuid: row.user_uuid ?? undefined,
            resultsPreview: row.results_preview,
            createdAt: row.created_at,
            targetDatabase: row.target_database,
        };
    }

    async findByUserAndProject(args: {
        organizationUuid: string;
        projectUuid: string;
        userUuid: string;
    }): Promise<SqlRun[]> {
        const rows = await this.database(SqlRunTableName)
            .select<any>('*')
            .innerJoin('organization_memberships', (builder) => {
                builder
                    .on(
                        'organization_memberships.organization_id',
                        '=',
                        'sql_run_history.organization_id',
                    )
                    .andOn(
                        'organization_memberships.user_id',
                        '=',
                        'sql_run_history.user_id',
                    );
            })
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'organization_memberships.organization_id',
            )
            .innerJoin(
                'users',
                'users.user_id',
                'organization_memberships.user_id',
            )
            .where('organizations.organization_id', args.organizationUuid)
            .andWhere('sql_run_history.project_uuid', args.projectUuid)
            .andWhere('users.user_id', args.userUuid);
        return rows.map((row) => ({
            sqlRunUuid: row.sql_run_uuid,
            sql: row.sql,
            projectUuid: row.project_uuid,
            createdByOrganizationUuid: row.organization_uuid ?? undefined,
            createdByUserUuid: row.user_uuid ?? undefined,
            resultsPreview: row.results_preview,
            createdAt: row.created_at,
            targetDatabase: row.target_database,
        }));
    }
}
