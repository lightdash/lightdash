import {
    type DepartmentMember,
    type DepartmentTargetProgress,
    type DepartmentWeeklyActivePoint,
} from '@lightdash/common';

export type MemberFilter = 'all' | 'noRecordedActivity' | 'inactive30d';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ACTIVE_DAYS = 30;

// A day is a UTC calendar day everywhere, so labels and filters agree in every time zone
const utcDay = (ms: number): number => Math.floor(ms / MS_PER_DAY);

const daysSince = (isoTimestamp: string, now: Date): number =>
    utcDay(now.getTime()) - utcDay(Date.parse(isoTimestamp));

const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

const formatUtcDate = (isoTimestamp: string): string => {
    const date = new Date(isoTimestamp);
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

// Who is active comes from the server's flag, never from comparing a timestamp to this clock
const matches = (member: DepartmentMember, filter: MemberFilter): boolean => {
    switch (filter) {
        case 'all':
            return true;
        case 'noRecordedActivity':
            return member.lastActiveAt === null;
        case 'inactive30d':
            return member.lastActiveAt !== null && !member.isActive30d;
        default:
            return false;
    }
};

export const filterMembers = (
    members: DepartmentMember[],
    filter: MemberFilter,
): DepartmentMember[] => members.filter((m) => matches(m, filter));

export const countMembersByFilter = (
    members: DepartmentMember[],
): Record<MemberFilter, number> => ({
    all: members.length,
    noRecordedActivity: filterMembers(members, 'noRecordedActivity').length,
    inactive30d: filterMembers(members, 'inactive30d').length,
});

// No recorded activity first, then the longest quiet; ties by email
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
    // Query history is kept for a limited time, so a missing timestamp is not proof of never
    if (lastActiveAt === null) return 'No recorded activity';
    const days = daysSince(lastActiveAt, now);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days <= ACTIVE_DAYS) return `${days} days ago`;
    return formatUtcDate(lastActiveAt);
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

const pluralPeople = (count: number): string =>
    `${count} ${count === 1 ? 'person' : 'people'}`;

// Captions use the same denominator as the percentage beside them (the headcount)
export const getCoverageCaption = (
    headcount: number | null,
    memberCount: number,
): string => {
    if (headcount === null) return 'Add a headcount to see a percentage';
    if (memberCount > headcount) {
        return `${memberCount} accounts, more than the headcount of ${headcount}`;
    }
    return `${memberCount} of ${headcount} people have an account`;
};

export const getActiveCaption = (
    headcount: number | null,
    activeCount: number,
    memberCount: number,
): string => {
    const withAccount =
        memberCount === 0
            ? null
            : `${activeCount} of the ${memberCount} with an account`;
    if (headcount === null) {
        return withAccount === null
            ? 'No one has an account yet'
            : `${withAccount} ${activeCount === 1 ? 'was' : 'were'} active`;
    }
    const overall =
        activeCount > headcount
            ? `${pluralPeople(activeCount)} active, more than the headcount of ${headcount}`
            : `${activeCount} of ${headcount} people ${activeCount === 1 ? 'was' : 'were'} active`;
    return withAccount === null ? overall : `${overall} · ${withAccount}`;
};
