import { z } from 'zod';
import { type CompilationHistoryReport } from '../compiler/compilationReport';

export type CompilationSource = 'cli_deploy' | 'refresh_dbt' | 'create_project';

export const CompilationSourceSchema = z.enum([
    'cli_deploy',
    'refresh_dbt',
    'create_project',
]);

export type ProjectCompileLog = {
    projectCompileLogId: string;
    projectUuid: string;
    jobUuid: string | null;
    userUuid: string | null;
    userName: string | null;
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
    'projectCompileLogId' | 'createdAt' | 'userName'
>;

export type ApiProjectCompileLogsResults = {
    data: ProjectCompileLog[];
    pagination?: {
        page: number;
        pageSize: number;
        totalPageCount: number;
        totalResults: number;
    };
};

export type ApiProjectCompileLogsResponse = {
    status: 'ok';
    results: ApiProjectCompileLogsResults;
};

export type ApiProjectCompileLogResponse = {
    status: 'ok';
    results: {
        log: ProjectCompileLog | undefined;
    };
};
