export type Scheduler = {
    schedulerUuid: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    userUuid: string;
    cron: string;
    savedChartUuid: string | null;
    dashboardUuid: string | null;
};

export type SchedulerWithTargets = Scheduler & {
    targets: SchedulerSlackTarget[];
};

export type ChartScheduler = Scheduler & {
    saved_chartUuid: string;
    dashboardUuid: null;
};
export type DashboardScheduler = Scheduler & {
    saved_chartUuid: null;
    dashboardUuid: string;
};

export type SchedulerSlackTarget = {
    schedulerSlackTargetUuid: string;
    createdAt: Date;
    updatedAt: Date;
    schedulerUuid: string; // secondary key to scheduler table
    channels: string[]; // slack channel ids
};
