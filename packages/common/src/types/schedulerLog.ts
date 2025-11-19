import { type AnyType } from './any';
import { type ApiSuccess } from './api/success';
import { type KnexPaginatedData } from './knex-paginate';
import {
    type SchedulerAndTargets,
    type SchedulerFormat,
    type SchedulerJobStatus,
} from './scheduler';
import { type SchedulerTaskName } from './schedulerTaskList';

export type SchedulerTargetType = 'email' | 'slack' | 'gsheets' | 'msteams';

export type SchedulerDetails = {
    projectUuid?: string;
    organizationUuid?: string;
    createdByUserUuid?: string;
    [key: string]: AnyType;
};

type BaseSchedulerLog = {
    jobId: string;
    task: SchedulerTaskName;
    status: SchedulerJobStatus;
    scheduledTime: Date;
    createdAt: Date;
};

export type SchedulerLog = BaseSchedulerLog & {
    schedulerUuid?: string;
    jobGroup?: string;
    target?: string;
    targetType?: SchedulerTargetType;
    details: SchedulerDetails;
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
    format: SchedulerFormat; // Scheduler format (CSV, IMAGE, GSHEETS, etc)
};

export type ApiSchedulerRunsResponse = ApiSuccess<
    KnexPaginatedData<SchedulerRun[]>
>;

// Run Logs API types

export type SchedulerRunLog = BaseSchedulerLog & {
    jobGroup: string;
    target: string | null;
    targetType: SchedulerTargetType | null;
    details: SchedulerDetails | null;
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
