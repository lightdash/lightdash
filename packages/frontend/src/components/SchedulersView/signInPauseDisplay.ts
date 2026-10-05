import {
    assertUnreachable,
    SchedulerFormat,
    type SchedulerAndTargets,
} from '@lightdash/common';

export type SignInPauseFilter = 'all' | 'paused' | 'personal';

export const signInWarehouseLabel = (warehouseType: string | null): string => {
    switch (warehouseType) {
        case 'bigquery':
            return 'BigQuery';
        case 'snowflake':
            return 'Snowflake';
        case 'databricks':
            return 'Databricks';
        default:
            return warehouseType ?? 'warehouse';
    }
};

export const matchesSignInPauseFilter = (
    scheduler: Pick<
        SchedulerAndTargets,
        'pausedReason' | 'runsOnPersonalSignIn'
    >,
    filter: SignInPauseFilter,
): boolean => {
    switch (filter) {
        case 'all':
            return true;
        case 'paused':
            return scheduler.pausedReason === 'sign_in_expired';
        case 'personal':
            return scheduler.runsOnPersonalSignIn;
        default:
            return assertUnreachable(filter, 'Unknown sign-in pause filter');
    }
};

export const canSendMissedRun = (
    scheduler: Pick<
        SchedulerAndTargets,
        'missedRunAt' | 'pausedReason' | 'format'
    >,
): boolean =>
    scheduler.missedRunAt !== null &&
    scheduler.pausedReason === null &&
    scheduler.format !== SchedulerFormat.GSHEETS;
