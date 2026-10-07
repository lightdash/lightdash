import {
    type DepartmentMember,
    type DepartmentTargetProgress,
    type DepartmentWeeklyActivePoint,
} from '@lightdash/common';
import dayjs from 'dayjs';

export type MemberFilter = 'all' | 'neverActive' | 'inactive30d';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ACTIVE_DAYS = 30;

const daysSince = (isoTimestamp: string, now: Date): number =>
    (now.getTime() - Date.parse(isoTimestamp)) / MS_PER_DAY;

const matches = (
    member: DepartmentMember,
    filter: MemberFilter,
    now: Date,
): boolean => {
    switch (filter) {
        case 'all':
            return true;
        case 'neverActive':
            return member.lastActiveAt === null;
        case 'inactive30d':
            return (
                member.lastActiveAt !== null &&
                daysSince(member.lastActiveAt, now) > ACTIVE_DAYS
            );
        default:
            return false;
    }
};

export const filterMembers = (
    members: DepartmentMember[],
    filter: MemberFilter,
    now: Date = new Date(),
): DepartmentMember[] => members.filter((m) => matches(m, filter, now));

export const countMembersByFilter = (
    members: DepartmentMember[],
    now: Date = new Date(),
): Record<MemberFilter, number> => ({
    all: members.length,
    neverActive: filterMembers(members, 'neverActive', now).length,
    inactive30d: filterMembers(members, 'inactive30d', now).length,
});

// Never active first, then the longest quiet; ties by email
export const sortMembers = (members: DepartmentMember[]): DepartmentMember[] =>
    [...members].sort((a, b) => {
        if (a.lastActiveAt === b.lastActiveAt) {
            return a.email.localeCompare(b.email);
        }
        if (a.lastActiveAt === null) return -1;
        if (b.lastActiveAt === null) return 1;
        return (
            Date.parse(a.lastActiveAt) - Date.parse(b.lastActiveAt) ||
            a.email.localeCompare(b.email)
        );
    });

export const formatLastActive = (
    lastActiveAt: string | null,
    now: Date = new Date(),
): string => {
    if (lastActiveAt === null) return 'Never';
    const days = dayjs(now)
        .startOf('day')
        .diff(dayjs(lastActiveAt).startOf('day'), 'day');
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days <= ACTIVE_DAYS) return `${days} days ago`;
    return dayjs(lastActiveAt).format('D MMM YYYY');
};

// How the person is in the department, in plain words
export const formatMemberSource = (
    member: Pick<
        DepartmentMember,
        'source' | 'sourceGroupName' | 'isDirect' | 'departmentName'
    >,
): string => {
    const via = member.isDirect ? null : `via ${member.departmentName}`;
    if (member.source === 'group') {
        const group = `Group ${member.sourceGroupName ?? 'unknown'}`;
        return via === null ? group : `${group}, ${via}`;
    }
    return via === null ? 'Direct' : `Via ${member.departmentName}`;
};

const plural = (count: number, noun: string): string =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;

const formatTimeLeft = (weeksLeft: number | null): string | null => {
    if (weeksLeft === null) return null;
    if (weeksLeft === 0) return 'Due this week';
    if (weeksLeft > 0) return `${plural(weeksLeft, 'week')} left`;
    return `${plural(-weeksLeft, 'week')} overdue`;
};

export const formatTargetProgress = (
    progress: DepartmentTargetProgress | null,
): { value: string; detail: string } => {
    if (progress === null) return { value: '–', detail: 'No target set' };
    const value = `${progress.activeUsers} of ${progress.targetActiveUsers}`;
    if (progress.remaining === 0) return { value, detail: 'Target met' };
    const left = `${progress.remaining} to go`;
    const time = formatTimeLeft(progress.weeksLeft);
    return { value, detail: time === null ? left : `${left} · ${time}` };
};

// Text alternative for the weekly chart, built from the points it draws
export const getWeeklyChartLabel = (
    points: DepartmentWeeklyActivePoint[],
): string => {
    if (points.length === 0) return 'No weekly activity data';
    const first = points[0];
    const last = points[points.length - 1];
    return `Weekly active people over ${points.length} weeks: this department had ${first.activeUsers} at the start and ${last.activeUsers} now, the average department had ${first.orgAverage} at the start and ${last.orgAverage} now`;
};

// People counted in the headcount who have no account yet, never shown as rows
export const countWithoutAccount = (
    effectiveHeadcount: number | null,
    memberCount: number,
): number =>
    effectiveHeadcount === null
        ? 0
        : Math.max(0, effectiveHeadcount - memberCount);
