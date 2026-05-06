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
    HOURLY = 'hourly',
    DAILY = 'daily',
}

export const ManagedAgentScheduleCronByOption: Record<
    ManagedAgentScheduleOption,
    string
> = {
    [ManagedAgentScheduleOption.HOURLY]: '0 * * * *',
    [ManagedAgentScheduleOption.DAILY]: '0 0 * * *',
};

export const getManagedAgentScheduleCron = (
    schedule: ManagedAgentScheduleOption = ManagedAgentScheduleOption.DAILY,
) => ManagedAgentScheduleCronByOption[schedule];

export const getManagedAgentScheduleOption = (
    scheduleCron: string | null | undefined,
) =>
    scheduleCron ===
    ManagedAgentScheduleCronByOption[ManagedAgentScheduleOption.DAILY]
        ? ManagedAgentScheduleOption.DAILY
        : ManagedAgentScheduleOption.HOURLY;

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
    createdAt: Date;
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
    actionType: ManagedAgentActionType;
    targetType: ManagedAgentTargetType;
    targetUuid: string;
    targetName: string;
    description: string;
    metadata: Record<string, unknown>;
};

export type ManagedAgentActionFilters = {
    date?: string;
    actionType?: ManagedAgentActionType;
    sessionId?: string;
};
