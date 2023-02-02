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
    savedChartUuid: string;
    dashboardUuid: null;
};
export type DashboardScheduler = SchedulerBase & {
    savedChartUuid: null;
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

export type CreateSchedulerSlackTarget = Pick<SchedulerSlackTarget, 'channels'>;
export type UpdateSchedulerSlackTarget = Pick<
    SchedulerSlackTarget,
    'schedulerSlackTargetUuid' | 'channels'
>;

export type CreateSchedulerWithTargets = Omit<
    Scheduler,
    'schedulerUuid' | 'createdAt' | 'updatedAt'
> & {
    targets: CreateSchedulerSlackTarget[];
};

export type UpdateSchedulerWithTargets = Pick<
    Scheduler,
    'schedulerUuid' | 'name' | 'cron'
> & {
    targets: Array<CreateSchedulerSlackTarget | UpdateSchedulerSlackTarget>;
};

export const isUpdateSchedulerSlackTarget = (
    data: CreateSchedulerSlackTarget | UpdateSchedulerSlackTarget,
): data is UpdateSchedulerSlackTarget =>
    'schedulerSlackTargetUuid' in data && !!data.schedulerSlackTargetUuid;

export const isChartScheduler = (data: Scheduler): data is ChartScheduler =>
    'savedChartUuid' in data && !!data.savedChartUuid;
