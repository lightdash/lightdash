import { type CompilationHistoryReport } from '@lightdash/common';
import { type Knex } from 'knex';
import {
    DbProjectCompileLog,
    ProjectCompileLogInsert,
    ProjectCompileLogTableName,
    type ProjectCompileLog,
} from '../database/entities/projectCompileLog';

export type { ProjectCompileLog };

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

    async getByProject(
        projectUuid: string,
        limit: number = 50,
    ): Promise<ProjectCompileLog[]> {
        const rows = await this.database(ProjectCompileLogTableName)
            .where('project_uuid', projectUuid)
            .orderBy('created_at', 'desc')
            .limit(limit);

        return rows.map(this.mapRow);
    }

    async getByJob(jobUuid: string): Promise<ProjectCompileLog | undefined> {
        const row = await this.database(ProjectCompileLogTableName)
            .where('job_uuid', jobUuid)
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
