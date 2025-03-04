import { SchedulerTaskName, TaskPayloadMap } from '@lightdash/common';
import { JobHelpers } from 'graphile-worker';

export type PayloadForTask<T extends SchedulerTaskName> = TaskPayloadMap[T];

export type TypedTask<T> = (payload: T, helpers: JobHelpers) => Promise<void>;

export type TypedTaskList = {
    [K in keyof TaskPayloadMap]: TypedTask<TaskPayloadMap[K]>;
};
