export type SchedulerBase = {
    schedulerUuid: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    userUuid: string;
    cron: string;
    savedChartUuid: string | null;
    dashboardUuid: string | null;
};

export type ChartScheduler = SchedulerBase & {
    saved_chartUuid: string;
    dashboardUuid: null;
};
export type DashboardScheduler = SchedulerBase & {
    saved_chartUuid: null;
    dashboardUuid: string;
};

export type Scheduler = ChartScheduler | DashboardScheduler;

export type SchedulerWithTargets = Scheduler & {
    targets: SchedulerSlackTarget[];
};

export type SchedulerSlackTarget = {
    schedulerSlackTargetUuid: string;
    createdAt: Date;
    updatedAt: Date;
    schedulerUuid: string; // secondary key to scheduler table
    channels: string[]; // slack channel ids
};

export type CreateSchedulerWithTargets = Omit<
    SchedulerWithTargets,
    'schedulerUuid' | 'createdAt' | 'updatedAt'
>;
