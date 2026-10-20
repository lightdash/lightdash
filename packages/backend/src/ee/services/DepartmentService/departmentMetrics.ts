import {
    assertUnreachable,
    computeEffectiveHeadcounts,
    getDirectMembersByDepartment,
    OrganizationMemberRole,
    rollUpByDepartment,
    type AdoptionMetrics,
    type Department,
    type DepartmentMembership,
    type OrganizationAdoptionSummary,
    type RoleSplit,
} from '@lightdash/common';
import { type ActivityRow } from '../../../models/DepartmentAnalyticsModel';

export type MetricsInput = {
    members: DepartmentMembership[];
    headcount: number | null;
    activeUserUuids: Set<string>; // active in the last 30 days
    weeksByUser: Map<string, Set<string>>;
    weekStarts: string[];
};

export type SnapshotInput = {
    departments: Department[];
    membership: DepartmentMembership[];
    activeUserUuids: Set<string>;
    weeklyActivity: ActivityRow[];
    weekStarts: string[];
};

export type AdoptionSnapshot = {
    summary: OrganizationAdoptionSummary;
    directMembers: Map<string, DepartmentMembership[]>;
    rolledMembers: Map<string, DepartmentMembership[]>;
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

// Uncapped: more accounts than headcount reads above 100
const pct = (num: number, headcount: number | null): number | null =>
    headcount === null || headcount <= 0
        ? null
        : Math.round((100 * num) / headcount);

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
        default:
            return assertUnreachable(role, `Unknown role ${role}`);
    }
};

export const computeAdoptionMetrics = (
    input: MetricsInput,
): AdoptionMetrics => {
    const { members, headcount, activeUserUuids, weeksByUser, weekStarts } =
        input;
    const trendWeeks = new Set(weekStarts);
    const roleSplit = members.reduce<RoleSplit>(
        (split, m) => bucket(split, m.role),
        { viewers: 0, interactiveViewers: 0, editors: 0, admins: 0 },
    );
    const isActive30d = (m: DepartmentMembership) =>
        activeUserUuids.has(m.userUuid);
    const activeCount30d = members.filter(isActive30d).length;
    const activeCount12w = members.filter(
        (m) =>
            isActive30d(m) ||
            [...(weeksByUser.get(m.userUuid) ?? [])].some((w) =>
                trendWeeks.has(w),
            ),
    ).length;

    return {
        memberCount: members.length,
        activeCount30d,
        activeCount12w,
        coveragePct: pct(members.length, headcount),
        activePct: pct(activeCount30d, headcount),
        roleSplit,
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
    const { departments, membership, activeUserUuids, weekStarts } = input;
    const weeksByUser = indexWeeklyActivity(input.weeklyActivity);
    const directMembers = getDirectMembersByDepartment(membership);
    const rolledMembers = rollUpByDepartment(departments, directMembers);
    const headcounts = computeEffectiveHeadcounts(departments);
    const metricsFor = (
        members: DepartmentMembership[],
        headcount: number | null,
    ) =>
        computeAdoptionMetrics({
            members,
            headcount,
            activeUserUuids,
            weeksByUser,
            weekStarts,
        });

    return {
        summary: {
            // The org row is a count baseline; there is no org-wide headcount
            organization: metricsFor(membership, null),
            departments: departments.map((d) => {
                const effective = headcounts.get(d.departmentUuid);
                const effectiveHeadcount =
                    effective?.effectiveHeadcount ?? d.headcount;
                return {
                    ...d,
                    effectiveHeadcount,
                    headcountBelowChildren:
                        effective?.headcountBelowChildren ?? false,
                    metrics: metricsFor(
                        rolledMembers.get(d.departmentUuid) ?? [],
                        effectiveHeadcount,
                    ),
                    directMetrics: metricsFor(
                        directMembers.get(d.departmentUuid) ?? [],
                        d.headcount,
                    ),
                };
            }),
            attention: {
                conflictCount: membership.filter(
                    (m) => m.resolution.kind === 'conflict',
                ).length,
                unassignedCount: membership.filter(
                    (m) => m.resolution.kind === 'unassigned',
                ).length,
            },
        },
        directMembers,
        rolledMembers,
    };
};
