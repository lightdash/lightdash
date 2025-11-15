import { type AnyType } from './any';
import { type ApiSuccess } from './api/success';
import { type KnexPaginatedData } from './knex-paginate';
import { type SchedulerAndTargets, type SchedulerJobStatus } from './scheduler';
import { type SchedulerTaskName } from './schedulerTaskList';

export type SchedulerLog = {
    task: SchedulerTaskName;
    schedulerUuid?: string;
    jobId: string;
    jobGroup?: string;
    scheduledTime: Date;
    createdAt: Date;
    status: SchedulerJobStatus;
    target?: string;
    targetType?: 'email' | 'slack' | 'gsheets' | 'msteams';
    details: {
        projectUuid: string | undefined; // For project creation, this is undefined
        organizationUuid: string;
        createdByUserUuid: string;
        [key: string]: AnyType;
    };
};

export type CreateSchedulerLog = Omit<SchedulerLog, 'createdAt'>;

export type SchedulerWithLogs = {
    schedulers: SchedulerAndTargets[];
    users: { firstName: string; lastName: string; userUuid: string }[];
    charts: { name: string; savedChartUuid: string }[];
    dashboards: { name: string; dashboardUuid: string }[];
    logs: SchedulerLog[];
};

export type ApiSchedulerLogsResponse = ApiSuccess<
    KnexPaginatedData<SchedulerWithLogs>
>;

// Scheduler Runs API types

export enum SchedulerRunStatus {
    COMPLETED = 'completed',
    PARTIAL_FAILURE = 'partial_failure',
    FAILED = 'failed',
    RUNNING = 'running',
    SCHEDULED = 'scheduled',
}

export type LogCounts = {
    total: number;
    scheduled: number;
    started: number;
    completed: number;
    error: number;
};

export type SchedulerRun = {
    runId: string;
    schedulerUuid: string;
    schedulerName: string;
    scheduledTime: Date;
    status: SchedulerJobStatus; // Parent job status from DB
    runStatus: SchedulerRunStatus; // Computed status for entire run
    createdAt: Date;
    details: Record<string, AnyType> | null;
    logCounts: LogCounts;
    // Metadata for filtering/display
    resourceType: 'chart' | 'dashboard';
    resourceUuid: string;
    resourceName: string;
    createdByUserUuid: string;
    createdByUserName: string;
};

export type ApiSchedulerRunsResponse = ApiSuccess<
    KnexPaginatedData<SchedulerRun[]>
>;

// Run Logs API types

export type SchedulerRunLog = {
    jobId: string;
    jobGroup: string;
    task: SchedulerTaskName;
    status: SchedulerJobStatus;
    scheduledTime: Date;
    createdAt: Date;
    target: string | null;
    targetType: 'email' | 'slack' | 'msteams' | 'gsheets' | null;
    details: Record<string, AnyType> | null;
    isParent: boolean;
};

export type SchedulerRunLogsResponse = {
    runId: string;
    schedulerUuid: string;
    schedulerName: string;
    scheduledTime: Date;
    logs: SchedulerRunLog[];
    // Metadata
    resourceType: 'chart' | 'dashboard';
    resourceUuid: string;
    resourceName: string;
    createdByUserUuid: string;
    createdByUserName: string;
};

export type ApiSchedulerRunLogsResponse = ApiSuccess<SchedulerRunLogsResponse>;
