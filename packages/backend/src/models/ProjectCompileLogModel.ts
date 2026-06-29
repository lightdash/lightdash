import {
    CompilationSource,
    KnexPaginateArgs,
    KnexPaginatedData,
    ProjectCompileLog,
    ProjectCompileLogInsert,
    type CompilationHistoryReport,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    DbProjectCompileLog,
    ProjectCompileLogTableName,
} from '../database/entities/projectCompileLog';
import KnexPaginate from '../database/pagination';

export type DbProjectCompileLogSortColumns = Extract<
    keyof DbProjectCompileLog,
    'created_at' | 'compilation_source'
>;

export class ProjectCompileLogModel {
    private database: Knex;

    constructor(args: { database: Knex }) {
        this.database = args.database;
    }

    async insert(data: ProjectCompileLogInsert): Promise<string> {
        const [row] = await this.database(ProjectCompileLogTableName)
            .insert({
                project_uuid: data.projectUuid,
                job_uuid: data.jobUuid,
                user_uuid: data.userUuid,
                organization_uuid: data.organizationUuid,
                compilation_source: data.compilationSource,
                dbt_connection_type: data.dbtConnectionType,
                request_method: data.requestMethod,
                warehouse_type: data.warehouseType,
                report: JSON.stringify(data.report),
            })
            .returning('project_compile_log_id');

        return row.project_compile_log_id;
    }

    async getLogs({
        organizationUuid,
        projectUuid,
        paginateArgs,
        sort,
        filters,
    }: {
        organizationUuid: string;
        projectUuid: string;
        paginateArgs?: KnexPaginateArgs;
        sort?: {
            column: DbProjectCompileLogSortColumns;
            direction: 'asc' | 'desc';
        };
        filters?: {
            triggeredByUserUuids?: string[];
            source?: CompilationSource;
        };
    }): Promise<KnexPaginatedData<ProjectCompileLog[]>> {
        let baseQuery = this.database(ProjectCompileLogTableName)
            .leftJoin(
                'users',
                'project_compile_log.user_uuid',
                'users.user_uuid',
            )
            .where('project_compile_log.organization_uuid', organizationUuid)
            .where('project_compile_log.project_uuid', projectUuid)
            .select(
                'project_compile_log.*',
                this.database.raw(
                    "CONCAT(users.first_name, ' ', users.last_name) as user_name",
                ),
            );

        if (filters) {
            if (
                filters.triggeredByUserUuids &&
                filters.triggeredByUserUuids.length > 0
            ) {
                baseQuery = baseQuery.whereIn(
                    'project_compile_log.user_uuid',
                    filters.triggeredByUserUuids,
                );
            }
            if (filters.source) {
                baseQuery = baseQuery.where(
                    'project_compile_log.compilation_source',
                    filters.source,
                );
            }
        }

        baseQuery = baseQuery.orderBy(
            `project_compile_log.${sort?.column ?? 'created_at'}`,
            sort?.direction ?? 'desc',
        );

        const { pagination, data } = await KnexPaginate.paginate<
            {},
            DbProjectCompileLog[]
        >(baseQuery, paginateArgs);

        return {
            pagination,
            data: data.map(this.mapRow),
        };
    }

    async getByJob(
        projectUuid: string,
        jobUuid: string,
    ): Promise<ProjectCompileLog | undefined> {
        const row = await this.database(ProjectCompileLogTableName)
            .leftJoin(
                'users',
                'project_compile_log.user_uuid',
                'users.user_uuid',
            )
            .where('project_compile_log.project_uuid', projectUuid)
            .where('project_compile_log.job_uuid', jobUuid)
            .select(
                'project_compile_log.*',
                this.database.raw(
                    "CONCAT(users.first_name, ' ', users.last_name) as user_name",
                ),
            )
            .first();

        return row ? this.mapRow(row) : undefined;
    }

    // eslint-disable-next-line class-methods-use-this
    private mapRow(row: DbProjectCompileLog): ProjectCompileLog {
        return {
            projectCompileLogId: row.project_compile_log_id,
            projectUuid: row.project_uuid,
            jobUuid: row.job_uuid,
            userUuid: row.user_uuid,
            userName: row.user_name,
            organizationUuid: row.organization_uuid,
            createdAt: row.created_at,
            compilationSource: row.compilation_source,
            dbtConnectionType: row.dbt_connection_type,
            requestMethod: row.request_method,
            warehouseType: row.warehouse_type,
            report:
                typeof row.report === 'string'
                    ? JSON.parse(row.report)
                    : row.report,
        };
    }
}
