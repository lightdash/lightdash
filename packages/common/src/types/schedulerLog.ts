import { type AnyType } from './any';
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
    targetType?: 'email' | 'slack' | 'gsheets';
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

export type ApiSchedulerLogsResponse = {
    status: 'ok';
    results: SchedulerWithLogs;
};
