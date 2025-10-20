import { CompilationHistoryReport } from '@lightdash/common';
import { Knex } from 'knex';
import { z } from 'zod';

export const ProjectCompileLogTableName = 'project_compile_log';

export const CompilationSourceSchema = z.enum([
    'cli_deploy',
    'refresh_dbt',
    'create_project',
]);
export type CompilationSource = z.infer<typeof CompilationSourceSchema>;

export const DbProjectCompileLogSchema = z.object({
    project_compile_log_id: z.string().uuid(),
    project_uuid: z.string().uuid(),
    job_uuid: z.string().uuid().nullable(),
    user_uuid: z.string().uuid().nullable(),
    organization_uuid: z.string().uuid(),
    created_at: z.date(),
    compilation_source: CompilationSourceSchema,
    dbt_connection_type: z.string().nullable(),
    request_method: z.string().nullable(),
    warehouse_type: z.string().nullable(),
    report: z.string(),
});

export type DbProjectCompileLog = z.infer<typeof DbProjectCompileLogSchema>;

export const DbProjectCompileLogInsertSchema = DbProjectCompileLogSchema.omit({
    project_compile_log_id: true,
    created_at: true,
});

export type DbProjectCompileLogInsert = z.infer<
    typeof DbProjectCompileLogInsertSchema
>;

export type ProjectCompileLogTable = Knex.CompositeTableType<
    DbProjectCompileLog,
    DbProjectCompileLogInsert
>;

export type ProjectCompileLog = {
    projectCompileLogId: string;
    projectUuid: string;
    jobUuid: string | null;
    userUuid: string | null;
    organizationUuid: string;
    createdAt: Date;
    compilationSource: CompilationSource;
    dbtConnectionType: string | null;
    requestMethod: string | null;
    warehouseType: string | null;
    report: CompilationHistoryReport;
};

export type ProjectCompileLogInsert = Omit<
    ProjectCompileLog,
    'projectCompileLogId' | 'createdAt'
>;
