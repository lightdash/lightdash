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

export enum GovernanceInsightKind {
    HEAVY_CUSTOM_USAGE = 'heavy_custom_usage',
    INCONSISTENT_DEFINITIONS = 'inconsistent_definitions',
    GOVERNANCE_ROLLUP = 'governance_rollup',
}

export enum GovernanceDefinitionType {
    METRIC = 'metric',
    SQL_DIMENSION = 'sql_dimension',
}

export type GovernanceVariantChart = {
    savedQueryUuid: string;
    savedQueryName: string;
    spaceUuid: string;
};

export type GovernanceVariant = {
    sql: string;
    name: string;
    chartCount: number;
    charts: GovernanceVariantChart[];
};

export type PromoteToDbtSuggestion = {
    kind: 'promote_to_dbt';
    canonicalSql: string | null;
    targetModel: string | null;
    proposedMetricName: string;
    yamlSnippet: string | null;
    rationale: string;
};

export type GovernanceInsightMetadata = {
    insightKind:
        | GovernanceInsightKind.HEAVY_CUSTOM_USAGE
        | GovernanceInsightKind.INCONSISTENT_DEFINITIONS;
    definitionType: GovernanceDefinitionType;
    nameSlug: string;
    variants: GovernanceVariant[];
    totalUsageCount: number;
    suggestion: PromoteToDbtSuggestion | null;
};

export type GovernanceRollupMetadata = {
    insightKind: GovernanceInsightKind.GOVERNANCE_ROLLUP;
    remainingByKind: Partial<
        Record<
            Exclude<
                GovernanceInsightKind,
                GovernanceInsightKind.GOVERNANCE_ROLLUP
            >,
            number
        >
    >;
    totalRemaining: number;
};

export const getGovernanceInsightMetadata = (
    metadata: Record<string, unknown>,
): GovernanceInsightMetadata | GovernanceRollupMetadata | null => {
    const { insightKind } = metadata;
    if (typeof insightKind !== 'string') return null;

    if (insightKind === GovernanceInsightKind.GOVERNANCE_ROLLUP) {
        const { totalRemaining, remainingByKind } = metadata;
        if (
            typeof totalRemaining !== 'number' ||
            typeof remainingByKind !== 'object' ||
            remainingByKind === null
        ) {
            return null;
        }
        return {
            insightKind: GovernanceInsightKind.GOVERNANCE_ROLLUP,
            totalRemaining,
            remainingByKind:
                remainingByKind as GovernanceRollupMetadata['remainingByKind'],
        };
    }

    if (
        insightKind !== GovernanceInsightKind.HEAVY_CUSTOM_USAGE &&
        insightKind !== GovernanceInsightKind.INCONSISTENT_DEFINITIONS
    ) {
        return null;
    }

    const { definitionType, nameSlug, variants, totalUsageCount, suggestion } =
        metadata;
    if (
        (definitionType !== GovernanceDefinitionType.METRIC &&
            definitionType !== GovernanceDefinitionType.SQL_DIMENSION) ||
        typeof nameSlug !== 'string' ||
        !Array.isArray(variants) ||
        typeof totalUsageCount !== 'number'
    ) {
        return null;
    }

    return {
        insightKind,
        definitionType,
        nameSlug,
        variants: variants as GovernanceVariant[],
        totalUsageCount,
        suggestion: (suggestion as PromoteToDbtSuggestion | null) ?? null,
    };
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
    actionCountsByType: Partial<Record<ManagedAgentActionType, number>>;
    summary: string | null;
    error: string | null;
    currentActivity: string | null;
};

export type ApiManagedAgentRunResponse = ApiSuccess<ManagedAgentRun | null>;

export type ApiManagedAgentActionResponse = ApiSuccess<ManagedAgentAction>;

export type ManagedAgentRunsListResponse = {
    runs: ManagedAgentRun[];
    nextCursor: string | null;
};

export type ApiManagedAgentRunsListResponse =
    ApiSuccess<ManagedAgentRunsListResponse>;

export type ManagedAgentActionFilters = {
    date?: string;
    actionType?: ManagedAgentActionType;
    sessionId?: string;
    runUuid?: string;
};
