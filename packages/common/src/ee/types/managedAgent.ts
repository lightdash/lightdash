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

export type ManagedAgentSettings = {
    projectUuid: string;
    enabled: boolean;
    scheduleCron: string;
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
    scheduleCron?: string;
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
