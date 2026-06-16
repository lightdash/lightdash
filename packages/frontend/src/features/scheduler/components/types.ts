import { type ThresholdOptions } from '@lightdash/common';

export enum Limit {
    TABLE = 'table',
    ALL = 'all',
    CUSTOM = 'custom',
}

// A scheduler is presented as an "alert" when it has thresholds, otherwise a
// "scheduled" delivery. Drives copy/labels/icons across scheduler components.
export type SchedulerDeliveryType = 'scheduled' | 'alert';

export const getSchedulerDeliveryType = (scheduler: {
    thresholds?: ThresholdOptions[];
}): SchedulerDeliveryType =>
    (scheduler.thresholds?.length ?? 0) > 0 ? 'alert' : 'scheduled';

export enum Values {
    FORMATTED = 'formatted',
    RAW = 'raw',
}

export enum SlackStates {
    LOADING,
    SUCCESS,
    NO_SLACK,
    MISSING_SCOPES,
}
