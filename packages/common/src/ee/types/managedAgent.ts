import { z } from 'zod';
import { type ApiSuccess } from '../../types/api/success';

export enum ManagedAgentActionType {
    FLAGGED_STALE = 'flagged_stale',
    SOFT_DELETED = 'soft_deleted',
    FLAGGED_BROKEN = 'flagged_broken',
    FLAGGED_SLOW = 'flagged_slow',
    FIXED_BROKEN = 'fixed_broken',
    CREATED_CONTENT = 'created_content',
    INSIGHT = 'insight',
    // Autopilot attempted a mutation that an admin protection stopped
    BLOCKED = 'blocked',
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

export enum ManagedAgentProtectedEntityType {
    CHART = 'chart',
    DASHBOARD = 'dashboard',
    SPACE = 'space',
}

// 'protected': Autopilot may see and report the entity but never mutate it.
// 'excluded': Autopilot does not see the entity at all.
// 'monitored': space rows only; marks allowlisted spaces when the project
// scope mode is 'only'.
export type ManagedAgentProtectionLevel =
    | 'protected'
    | 'excluded'
    | 'monitored';

export type ManagedAgentSpaceScopeMode = 'all-except' | 'only';

export const AGENT_SUGGESTIONS_SPACE_SLUG = 'agent-suggestions';

// Resolves which spaces Autopilot must not see. Selections inherit down the
// space tree; the Agent Suggestions space is always in scope so Autopilot can
// keep managing its own output.
export const computeAutopilotExcludedSpaceUuids = (
    spaces: Array<{
        uuid: string;
        parentSpaceUuid: string | null;
        slug: string;
    }>,
    mode: ManagedAgentSpaceScopeMode,
    selectedSpaceUuids: string[],
): Set<string> => {
    const childrenByParent = new Map<string, string[]>();
    spaces.forEach((space) => {
        if (space.parentSpaceUuid) {
            const children = childrenByParent.get(space.parentSpaceUuid) ?? [];
            children.push(space.uuid);
            childrenByParent.set(space.parentSpaceUuid, children);
        }
    });

    const withSubtrees = (rootUuids: string[]): Set<string> => {
        const result = new Set<string>();
        const queue = [...rootUuids];
        while (queue.length > 0) {
            const uuid = queue.pop();
            if (uuid !== undefined && !result.has(uuid)) {
                result.add(uuid);
                (childrenByParent.get(uuid) ?? []).forEach((child) =>
                    queue.push(child),
                );
            }
        }
        return result;
    };

    const selected = withSubtrees(selectedSpaceUuids);
    const excluded =
        mode === 'all-except'
            ? selected
            : new Set(
                  spaces
                      .map((space) => space.uuid)
                      .filter((uuid) => !selected.has(uuid)),
              );

    spaces.forEach((space) => {
        if (space.slug === AGENT_SUGGESTIONS_SPACE_SLUG) {
            excluded.delete(space.uuid);
        }
    });
    return excluded;
};

export type ManagedAgentProtection = {
    projectUuid: string;
    entityType: ManagedAgentProtectedEntityType;
    entityUuid: string;
    level: ManagedAgentProtectionLevel;
    createdByUserUuid: string | null;
    createdAt: Date;
};

export type ManagedAgentAggression = 'observe' | 'flag' | 'cleanup';

export type ManagedAgentAudience = 'admins' | 'everyone';

export type ManagedAgentPolicy = {
    stalenessChartDays: number;
    stalenessDashboardDays: number;
    previewProjectDays: number;
    slowQueryThresholdMs: number;
    protectRecentDays: number;
    escalationHours: number;
    aggression: ManagedAgentAggression;
    audience: ManagedAgentAudience;
    spaceScopeMode: ManagedAgentSpaceScopeMode;
    verifiedContent: 'protected' | 'none';
};

export type UpdateManagedAgentPolicy = Partial<ManagedAgentPolicy>;

// Per-field .catch() keeps one bad stored value from discarding the rest
const managedAgentPolicySchema = z.object({
    stalenessChartDays: z.number().int().min(7).max(3650).default(90).catch(90),
    stalenessDashboardDays: z
        .number()
        .int()
        .min(7)
        .max(3650)
        .default(90)
        .catch(90),
    previewProjectDays: z.number().int().min(7).max(3650).default(90).catch(90),
    slowQueryThresholdMs: z
        .number()
        .int()
        .min(100)
        .max(600_000)
        .default(2000)
        .catch(2000),
    protectRecentDays: z.number().int().min(0).max(365).default(30).catch(30),
    escalationHours: z.number().int().min(0).max(720).default(24).catch(24),
    aggression: z
        .enum(['observe', 'flag', 'cleanup'])
        .default('cleanup')
        .catch('cleanup'),
    audience: z
        .enum(['admins', 'everyone'])
        .default('everyone')
        .catch('everyone'),
    spaceScopeMode: z
        .enum(['all-except', 'only'])
        .default('all-except')
        .catch('all-except'),
    verifiedContent: z
        .enum(['protected', 'none'])
        .default('protected')
        .catch('protected'),
});

export const DEFAULT_MANAGED_AGENT_POLICY: ManagedAgentPolicy =
    managedAgentPolicySchema.parse({});

export const resolveManagedAgentPolicy = (
    input: unknown,
): ManagedAgentPolicy => {
    const result = managedAgentPolicySchema.safeParse(input ?? {});
    return result.success ? result.data : DEFAULT_MANAGED_AGENT_POLICY;
};

export type ManagedAgentSettings = {
    projectUuid: string;
    enabled: boolean;
    schedule: ManagedAgentScheduleOption;
    enabledByUserUuid: string | null;
    slackChannelId: string | null;
    toolSettings: Record<string, boolean>;
    policy: ManagedAgentPolicy;
    scopedSpaceUuids: string[];
    createdAt: Date;
    updatedAt: Date;
};

export type UpdateManagedAgentSpaceScope = {
    mode: ManagedAgentSpaceScopeMode;
    spaceUuids: string[];
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
    policy?: UpdateManagedAgentPolicy;
    spaceScope?: UpdateManagedAgentSpaceScope;
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
    dateFrom?: string;
    dateTo?: string;
    /** @deprecated Use `actionTypes`. Still accepted and merged into it. */
    actionType?: ManagedAgentActionType;
    actionTypes?: ManagedAgentActionType[];
    targetTypes?: ManagedAgentTargetType[];
    search?: string;
    sessionId?: string;
    runUuid?: string;
    limit?: number;
};
