import { type ApiSuccess } from '../../types/api/success';

export enum ManagedAgentActionType {
    FLAGGED_STALE = 'flagged_stale',
    SOFT_DELETED = 'soft_deleted',
    FLAGGED_BROKEN = 'flagged_broken',
    FLAGGED_SLOW = 'flagged_slow',
    FIXED_BROKEN = 'fixed_broken',
    CREATED_CONTENT = 'created_content',
    INSIGHT = 'insight',
}

export enum ManagedAgentTargetType {
    CHART = 'chart',
    DASHBOARD = 'dashboard',
    SPACE = 'space',
    PROJECT = 'project',
}

export enum ManagedAgentScheduleOption {
    EVERY_6_HOURS = 'every_6_hours',
    EVERY_12_HOURS = 'every_12_hours',
    DAILY = 'daily',
    EVERY_2_DAYS = 'every_2_days',
    WEEKLY = 'weekly',
}

export const ManagedAgentScheduleCronByOption: Record<
    ManagedAgentScheduleOption,
    string
> = {
    [ManagedAgentScheduleOption.EVERY_6_HOURS]: '0 */6 * * *',
    [ManagedAgentScheduleOption.EVERY_12_HOURS]: '0 */12 * * *',
    [ManagedAgentScheduleOption.DAILY]: '0 0 * * *',
    [ManagedAgentScheduleOption.EVERY_2_DAYS]: '0 0 */2 * *',
    [ManagedAgentScheduleOption.WEEKLY]: '0 0 * * 0',
};

const LEGACY_HOURLY_CRON = '0 * * * *';

export const getManagedAgentScheduleCron = (
    schedule: ManagedAgentScheduleOption = ManagedAgentScheduleOption.DAILY,
) => ManagedAgentScheduleCronByOption[schedule];

export const getManagedAgentScheduleOption = (
    scheduleCron: string | null | undefined,
): ManagedAgentScheduleOption => {
    if (scheduleCron === LEGACY_HOURLY_CRON) {
        return ManagedAgentScheduleOption.EVERY_6_HOURS;
    }
    const match = (
        Object.entries(ManagedAgentScheduleCronByOption) as Array<
            [ManagedAgentScheduleOption, string]
        >
    ).find(([, cron]) => cron === scheduleCron);
    return match ? match[0] : ManagedAgentScheduleOption.DAILY;
};

export type ManagedAgentSettings = {
    projectUuid: string;
    enabled: boolean;
    schedule: ManagedAgentScheduleOption;
    enabledByUserUuid: string | null;
    slackChannelId: string | null;
    toolSettings: Record<string, boolean>;
    createdAt: Date;
    updatedAt: Date;
};

export type ManagedAgentActionUser = {
    userUuid: string;
    firstName: string;
    lastName: string;
};

export type ManagedAgentAction = {
    actionUuid: string;
    projectUuid: string;
    sessionId: string;
    actionType: ManagedAgentActionType;
    targetType: ManagedAgentTargetType;
    targetUuid: string;
    targetName: string;
    description: string;
    metadata: Record<string, unknown>;
    reversedAt: Date | null;
    reversedByUserUuid: string | null;
    reversedByUser: ManagedAgentActionUser | null;
    createdAt: Date;
};

export type ManagedAgentActionCategory = 'undo' | 'dismiss';

const REVERSIBLE_ACTION_TYPES: ReadonlySet<ManagedAgentActionType> = new Set([
    ManagedAgentActionType.SOFT_DELETED,
    ManagedAgentActionType.CREATED_CONTENT,
    ManagedAgentActionType.FIXED_BROKEN,
]);

export const getManagedAgentActionCategory = (
    actionType: ManagedAgentActionType,
): ManagedAgentActionCategory =>
    REVERSIBLE_ACTION_TYPES.has(actionType) ? 'undo' : 'dismiss';

export type FixedBrokenActionMetadata = {
    previousVersionUuid: string;
};

export const getFixedBrokenMetadata = (
    metadata: Record<string, unknown>,
): FixedBrokenActionMetadata | null => {
    const { previousVersionUuid } = metadata;
    return typeof previousVersionUuid === 'string'
        ? { previousVersionUuid }
        : null;
};

export type UpdateManagedAgentSettings = {
    enabled?: boolean;
    schedule?: ManagedAgentScheduleOption;
    slackChannelId?: string | null;
    toolSettings?: Record<string, boolean>;
};

export type CreateManagedAgentAction = {
    projectUuid: string;
    sessionId: string;
    managedAgentRunUuid: string | null;
    actionType: ManagedAgentActionType;
    targetType: ManagedAgentTargetType;
    targetUuid: string;
    targetName: string;
    description: string;
    metadata: Record<string, unknown>;
};

export enum ManagedAgentRunStatus {
    STARTED = 'started',
    COMPLETED = 'completed',
    ERROR = 'error',
}

export type ManagedAgentRunTriggeredBy = 'cron' | 'manual' | 'on_enable';

export type ManagedAgentRun = {
    runUuid: string;
    projectUuid: string;
    triggeredBy: ManagedAgentRunTriggeredBy;
    status: ManagedAgentRunStatus;
    sessionId: string | null;
    startedAt: Date;
    finishedAt: Date | null;
    actionCount: number;
    summary: string | null;
    error: string | null;
};

export type ApiManagedAgentRunResponse = ApiSuccess<ManagedAgentRun | null>;

export type ManagedAgentActionFilters = {
    date?: string;
    actionType?: ManagedAgentActionType;
    sessionId?: string;
};
