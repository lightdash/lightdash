import {
    computeEffectiveHeadcounts,
    getActivityBucket,
    getChildrenMap,
    getDirectMembersByDepartment,
    getResidualHeadcount,
    OrganizationMemberRole,
    rollUpByDepartment,
    type ActivitySplit,
    type ActivityWindows,
    type AdoptionMetrics,
    type Department,
    type DepartmentMembership,
    type OrganizationAdoptionSummary,
    type RoleSplit,
} from '@lightdash/common';
import Logger from '../../../logging/logger';
import { type ActivityRow } from '../../../models/DepartmentAnalyticsModel';

export type MetricsInput = {
    members: DepartmentMembership[];
    headcount: number | null;
    // Each person's latest activity back to the at-risk bound; anyone missing has none in that time
    lastActiveAt: Map<string, Date>;
    windows: ActivityWindows;
    weeksByUser: Map<string, Set<string>>;
    weekStarts: string[];
};

export type SnapshotInput = {
    departments: Department[];
    membership: DepartmentMembership[];
    lastActiveAt: Map<string, Date>;
    windows: ActivityWindows;
    weeklyActivity: ActivityRow[];
    weekStarts: string[];
};

export type AdoptionSnapshot = {
    summary: OrganizationAdoptionSummary;
    // By department: who counts in it (direct), and in it or below it (rolled)
    directMembers: Map<string, DepartmentMembership[]>;
    rolledMembers: Map<string, DepartmentMembership[]>;
    activeUserUuids: Set<string>; // active in the last 30 days
};

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

// Mondays computed in UTC, matching date_trunc('week', ...) in a UTC database session
export const lastNWeekStarts = (
    n: number,
    now: Date = new Date(),
): string[] => {
    const monday = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const offset = (monday.getUTCDay() + 6) % 7; // Monday = 0
    monday.setUTCDate(monday.getUTCDate() - offset);
    return Array.from({ length: n }, (_, i) => {
        const d = new Date(monday);
        d.setUTCDate(monday.getUTCDate() - (n - 1 - i) * 7);
        return isoDate(d);
    });
};

export const indexWeeklyActivity = (
    rows: ActivityRow[],
): Map<string, Set<string>> => {
    const weeksByUser = new Map<string, Set<string>>();
    rows.forEach((row) => {
        const weeks = weeksByUser.get(row.userUuid) ?? new Set<string>();
        weeks.add(row.weekStart);
        weeksByUser.set(row.userUuid, weeks);
    });
    return weeksByUser;
};

// Never above 100, as neither an effective nor a residual headcount is ever below the people it counts
const pct = (num: number, headcount: number | null): number | null =>
    headcount === null || headcount <= 0
        ? null
        : Math.round((100 * num) / headcount);

const warnedRoles = new Set<string>();

const bucket = (split: RoleSplit, role: OrganizationMemberRole): RoleSplit => {
    switch (role) {
        case OrganizationMemberRole.MEMBER:
        case OrganizationMemberRole.VIEWER:
            return { ...split, viewers: split.viewers + 1 };
        case OrganizationMemberRole.INTERACTIVE_VIEWER:
            return {
                ...split,
                interactiveViewers: split.interactiveViewers + 1,
            };
        case OrganizationMemberRole.EDITOR:
        case OrganizationMemberRole.DEVELOPER:
            return { ...split, editors: split.editors + 1 };
        case OrganizationMemberRole.ADMIN:
            return { ...split, admins: split.admins + 1 };
        default: {
            // Still exhaustive at compile time; a role added to the database later counts as a
            // viewer instead of failing the whole summary, and is logged once per role
            const unknownRole: never = role;
            if (!warnedRoles.has(String(unknownRole))) {
                warnedRoles.add(String(unknownRole));
                Logger.warn(
                    `Adoption by department counts unknown organization role "${String(unknownRole)}" as a viewer`,
                );
            }
            return { ...split, viewers: split.viewers + 1 };
        }
    }
};

export const computeAdoptionMetrics = (
    input: MetricsInput,
): AdoptionMetrics => {
    const {
        members,
        headcount,
        lastActiveAt,
        windows,
        weeksByUser,
        weekStarts,
    } = input;
    const trendWeeks = new Set(weekStarts);
    const roleSplit = members.reduce<RoleSplit>(
        (split, m) => bucket(split, m.role),
        { viewers: 0, interactiveViewers: 0, editors: 0, admins: 0 },
    );
    // Healthy is active in the last 30 days, so the 30-day count is the healthy one and the two never differ
    const activitySplit: ActivitySplit = { healthy: 0, atRisk: 0, lost: 0 };
    let activeCount12w = 0;
    members.forEach((m) => {
        const activity = getActivityBucket(
            lastActiveAt.get(m.userUuid) ?? null,
            windows,
        );
        activitySplit[activity] += 1;
        if (
            activity === 'healthy' ||
            [...(weeksByUser.get(m.userUuid) ?? [])].some((w) =>
                trendWeeks.has(w),
            )
        ) {
            activeCount12w += 1;
        }
    });
    const activeCount30d = activitySplit.healthy;

    return {
        memberCount: members.length,
        activeCount30d,
        activeCount12w,
        coveragePct: pct(members.length, headcount),
        activePct: pct(activeCount30d, headcount),
        roleSplit,
        activitySplit,
        weeklyActive: weekStarts.map((weekStart) => ({
            weekStart,
            activeUsers: members.filter((m) =>
                weeksByUser.get(m.userUuid)?.has(weekStart),
            ).length,
        })),
    };
};

export const buildAdoptionSnapshot = (
    input: SnapshotInput,
): AdoptionSnapshot => {
    const { departments, membership, lastActiveAt, windows, weekStarts } =
        input;
    const weeksByUser = indexWeeklyActivity(input.weeklyActivity);
    const directMembers = getDirectMembersByDepartment(membership);
    const rolledMembers = rollUpByDepartment(departments, directMembers);
    // Active in the last 30 days: the healthy bucket, read with the same bounds as the counts
    const activeUserUuids = new Set(
        [...lastActiveAt]
            .filter(([, at]) => getActivityBucket(at, windows) === 'healthy')
            .map(([userUuid]) => userUuid),
    );
    const departmentUuids = new Set(departments.map((d) => d.departmentUuid));
    // Everyone who counts in at least one department, once each
    const counted = membership.filter((m) =>
        m.countedDepartmentUuids.some((uuid) => departmentUuids.has(uuid)),
    );
    const headcounts = computeEffectiveHeadcounts(
        departments,
        new Map(
            [...rolledMembers].map(([uuid, members]) => [uuid, members.length]),
        ),
    );
    const children = getChildrenMap(departments);
    const metricsFor = (
        members: DepartmentMembership[],
        headcount: number | null,
    ) =>
        computeAdoptionMetrics({
            members,
            headcount,
            lastActiveAt,
            windows,
            weeksByUser,
            weekStarts,
        });

    return {
        summary: {
            // The org row is a count baseline; there is no org-wide headcount
            organization: metricsFor(counted, null),
            departments: departments.map((d) => {
                const members = rolledMembers.get(d.departmentUuid) ?? [];
                const direct = directMembers.get(d.departmentUuid) ?? [];
                const effective = headcounts.get(d.departmentUuid);
                const effectiveHeadcount =
                    effective?.effectiveHeadcount ??
                    Math.max(d.headcount ?? 0, members.length);
                const childrenEffectiveHeadcount = (
                    children.get(d.departmentUuid) ?? []
                ).reduce(
                    (sum, uuid) =>
                        sum + (headcounts.get(uuid)?.effectiveHeadcount ?? 0),
                    0,
                );
                return {
                    ...d,
                    effectiveHeadcount,
                    hasHeadcount:
                        effective?.hasHeadcount ?? d.headcount !== null,
                    headcountBelowChildren:
                        effective?.headcountBelowChildren ?? false,
                    metrics: metricsFor(members, effectiveHeadcount),
                    // Its own people, over the headcount it keeps for them beside its sub-departments
                    directMetrics: metricsFor(
                        direct,
                        getResidualHeadcount(
                            effectiveHeadcount,
                            childrenEffectiveHeadcount,
                            direct.length,
                        ),
                    ),
                };
            }),
            attention: {
                unassignedCount: membership.filter(
                    (m) => m.kind === 'unassigned',
                ).length,
                // Counted in each of their departments until someone picks one
                sharedCount: membership.filter(
                    (m) =>
                        m.kind === 'shared' && m.primaryDepartmentUuid === null,
                ).length,
            },
        },
        directMembers,
        rolledMembers,
        activeUserUuids,
    };
};
