import {
    getActivityBucket,
    getDepthMap,
    getDescendantUuids,
    type ActivityWindows,
    type Department,
    type DepartmentMember,
    type DepartmentMembership,
    type DepartmentTargetProgress,
    type DepartmentWeeklyActivePoint,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import { type MemberActivityRow } from '../../../models/DepartmentAnalyticsModel';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Rounded up to whole weeks, so a partial week counts; negative once the date has passed, 0 on the day
const computeWeeksLeft = (targetDate: string, now: Date): number => {
    const today = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
    );
    const days = Math.round(
        (Date.parse(`${targetDate}T00:00:00Z`) - today) / MS_PER_DAY,
    );
    return days >= 0 ? Math.ceil(days / 7) : -Math.ceil(-days / 7);
};

export const computeTargetProgress = (
    department: Pick<Department, 'targetActiveUsers' | 'targetDate'>,
    activeUsers: number,
    now: Date = new Date(),
): DepartmentTargetProgress | null => {
    if (department.targetActiveUsers === null) return null;
    return {
        targetActiveUsers: department.targetActiveUsers,
        targetDate: department.targetDate,
        activeUsers,
        remaining: Math.max(department.targetActiveUsers - activeUsers, 0),
        weeksLeft:
            department.targetDate === null
                ? null
                : computeWeeksLeft(department.targetDate, now),
    };
};

export const computeWeeklyWithOrgAverage = (
    department: DepartmentWithMetrics,
    all: DepartmentWithMetrics[],
): DepartmentWeeklyActivePoint[] => {
    // Every department's depth in one pass, not one walk up the tree per department
    const depths = getDepthMap(all);
    const depthOf = (uuid: string) => depths.get(uuid) ?? 0;
    const depth = depthOf(department.departmentUuid);
    const peers = all.filter((d) => depthOf(d.departmentUuid) === depth);
    return department.metrics.weeklyActive.map((point, index) => {
        const total = peers.reduce(
            (sum, peer) =>
                sum + (peer.metrics.weeklyActive[index]?.activeUsers ?? 0),
            0,
        );
        return {
            weekStart: point.weekStart,
            activeUsers: point.activeUsers,
            orgAverage:
                peers.length === 0
                    ? 0
                    : Math.round((10 * total) / peers.length) / 10,
        };
    });
};

export const buildDepartmentMembers = (input: {
    departmentUuid: string;
    members: DepartmentMembership[];
    departments: Pick<
        Department,
        'departmentUuid' | 'parentDepartmentUuid' | 'name'
    >[];
    activity: MemberActivityRow[];
    // The bounds the summary's counts were taken with, so each person lands in the bucket that counts them
    windows: ActivityWindows;
}): DepartmentMember[] => {
    const names = new Map(
        input.departments.map((d) => [d.departmentUuid, d.name]),
    );
    const branch = new Set([
        input.departmentUuid,
        ...getDescendantUuids(input.departmentUuid, input.departments),
    ]);
    const nameOf = (departmentUuid: string) => names.get(departmentUuid) ?? '';
    const activity = new Map(input.activity.map((a) => [a.userUuid, a]));
    const built = input.members.flatMap((member): DepartmentMember[] => {
        // Where they count under this department: here if they count here, else the first sub-department
        const countedHere = member.placements.filter(
            (p) =>
                branch.has(p.departmentUuid) &&
                member.countedDepartmentUuids.includes(p.departmentUuid),
        );
        const placement =
            countedHere.find(
                (p) => p.departmentUuid === input.departmentUuid,
            ) ?? countedHere[0];
        if (placement === undefined) return [];
        const row = activity.get(member.userUuid);
        return [
            {
                userUuid: member.userUuid,
                email: member.email,
                firstName: member.firstName,
                lastName: member.lastName,
                role: member.role,
                departmentUuid: placement.departmentUuid,
                departmentName: nameOf(placement.departmentUuid),
                isDirect: placement.departmentUuid === input.departmentUuid,
                source: placement.source,
                sourceGroupName: placement.sourceGroupName,
                lastActiveAt: row?.lastActiveAt?.toISOString() ?? null,
                isActive30d: row?.isActive30d ?? false,
                activity: getActivityBucket(
                    row?.lastActiveAt ?? null,
                    input.windows,
                ),
                queries30d: row?.queries30d ?? 0,
                dashboardViews30d: row?.dashboardViews30d ?? 0,
                sharedWith: member.placements
                    .filter(
                        (p) => p.departmentUuid !== placement.departmentUuid,
                    )
                    .map((p) => ({
                        departmentUuid: p.departmentUuid,
                        name: nameOf(p.departmentUuid),
                    })),
                primaryDepartmentUuid: member.primaryDepartmentUuid,
            },
        ];
    });
    // No recorded activity first, then longest inactive, then by name
    return built.sort((a, b) => {
        if (a.lastActiveAt === null && b.lastActiveAt !== null) return -1;
        if (a.lastActiveAt !== null && b.lastActiveAt === null) return 1;
        if (a.lastActiveAt !== b.lastActiveAt) {
            return (a.lastActiveAt ?? '') < (b.lastActiveAt ?? '') ? -1 : 1;
        }
        return `${a.firstName} ${a.lastName}`.localeCompare(
            `${b.firstName} ${b.lastName}`,
        );
    });
};
