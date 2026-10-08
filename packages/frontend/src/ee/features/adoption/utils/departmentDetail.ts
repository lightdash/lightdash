import {
    assertUnreachable,
    type AdoptionMetrics,
    type DepartmentMember,
    type DepartmentTargetProgress,
    type DepartmentTopContentItem,
    type WeeklyActivePoint,
} from '@lightdash/common';
import { formatShare } from './departmentRows';
import { formatCount } from './format';

export type MemberFilter =
    | 'all'
    | 'active30d'
    | 'inactive30d'
    | 'noRecordedActivity';

// The words for one and for any other count, for example "query" and "queries"
export type Noun = { one: string; other: string };

const PEOPLE: Noun = { one: 'person', other: 'people' };
const WEEKS: Noun = { one: 'week', other: 'weeks' };

export const formatQuantity = (count: number, noun: Noun): string =>
    `${formatCount(count)} ${count === 1 ? noun.one : noun.other}`;

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

const formatUtcDayMonth = (date: Date): string =>
    `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;

const formatUtcDate = (isoTimestamp: string): string => {
    const date = new Date(isoTimestamp);
    return `${formatUtcDayMonth(date)} ${date.getUTCFullYear()}`;
};

// Who is active comes from the server's flag, never from comparing a timestamp to this clock
const matches = (member: DepartmentMember, filter: MemberFilter): boolean => {
    switch (filter) {
        case 'all':
            return true;
        case 'active30d':
            return member.isActive30d;
        case 'inactive30d':
            return member.lastActiveAt !== null && !member.isActive30d;
        case 'noRecordedActivity':
            return member.lastActiveAt === null;
        default:
            return assertUnreachable(filter, `Unknown member filter ${filter}`);
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
    active30d: filterMembers(members, 'active30d').length,
    inactive30d: filterMembers(members, 'inactive30d').length,
    noRecordedActivity: filterMembers(members, 'noRecordedActivity').length,
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
    // Only the last 90 days are read, and queries are kept for less, so a missing timestamp is not proof of never
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

const formatTimeLeft = (weeksLeft: number | null): string | null => {
    if (weeksLeft === null) return null;
    if (weeksLeft === 0) return 'Due this week';
    if (weeksLeft > 0) return `${formatQuantity(weeksLeft, WEEKS)} left`;
    return `${formatQuantity(-weeksLeft, WEEKS)} overdue`;
};

export const formatTargetProgress = (
    progress: DepartmentTargetProgress | null,
): { value: string; detail: string } => {
    if (progress === null) return { value: '–', detail: 'No target set' };
    const value = `${formatCount(progress.activeUsers)} of ${formatCount(progress.targetActiveUsers)}`;
    if (progress.remaining === 0) return { value, detail: 'Target met' };
    const left = `${formatCount(progress.remaining)} to go`;
    const time = formatTimeLeft(progress.weeksLeft);
    return { value, detail: time === null ? left : `${left} · ${time}` };
};

export const formatTopContentUsage = (
    item: DepartmentTopContentItem,
    noun: Noun,
): string =>
    `${formatQuantity(item.count, noun)} · ${formatQuantity(item.distinctPeople, PEOPLE)}`;

export type WeeklyComparisonPoint = {
    weekStart: string;
    activeUsers: number;
    atOrgRate: number | null; // null until the organization's numbers for the week are loaded
};

// To one decimal place, as the expected count of a small department is often below ten
const roundToTenth = (value: number): number => Math.round(value * 10) / 10;

// Each week: the organization's active share of its people on Lightdash, applied to this department's people on Lightdash
export const getWeeklyComparison = (
    weeks: WeeklyActivePoint[],
    memberCount: number,
    organization: Pick<AdoptionMetrics, 'memberCount' | 'weeklyActive'> | null,
): WeeklyComparisonPoint[] => {
    const organizationActive = new Map(
        (organization?.weeklyActive ?? []).map((point) => [
            point.weekStart,
            point.activeUsers,
        ]),
    );
    const atOrgRate = (weekStart: string): number | null => {
        const active = organizationActive.get(weekStart);
        if (organization === null || active === undefined) return null;
        if (organization.memberCount === 0) return 0;
        return roundToTenth((active * memberCount) / organization.memberCount);
    };
    return weeks.map(({ weekStart, activeUsers }) => ({
        weekStart,
        activeUsers,
        atOrgRate: atOrgRate(weekStart),
    }));
};

const PARTIAL_WEEK_LABEL = 'This week so far';
// The same words on two short lines, so the dates before it keep their room on the axis
const PARTIAL_WEEK_AXIS_LABEL = 'This week\nso far';

const labelWeeks = (
    weeks: Pick<WeeklyActivePoint, 'weekStart'>[],
    partialLabel: string,
): string[] =>
    weeks.map((week, index) =>
        index === weeks.length - 1
            ? partialLabel
            : formatUtcDayMonth(new Date(week.weekStart)),
    );

// Weeks are named by their Monday; the last one is still running
export const getWeekLabels = (
    weeks: Pick<WeeklyActivePoint, 'weekStart'>[],
): string[] => labelWeeks(weeks, PARTIAL_WEEK_LABEL);

export const getWeekAxisLabels = (
    weeks: Pick<WeeklyActivePoint, 'weekStart'>[],
): string[] => labelWeeks(weeks, PARTIAL_WEEK_AXIS_LABEL);

export const THIS_DEPARTMENT = 'This department';
export const AT_ORG_RATE = "At the organization's rate";

export const getWeekTooltipRows = (
    week: WeeklyComparisonPoint,
    label: string,
): string[] => {
    const department = `${THIS_DEPARTMENT}: ${formatCount(week.activeUsers)}`;
    return week.atOrgRate === null
        ? [label, department]
        : [label, department, `${AT_ORG_RATE}: ${formatCount(week.atOrgRate)}`];
};

// Text alternative for the weekly chart, built from the points it draws
export const getWeeklyChartLabel = (weeks: WeeklyComparisonPoint[]): string => {
    if (weeks.length === 0) return 'No weekly activity data';
    const first = weeks[0];
    const last = weeks[weeks.length - 1];
    const department = `Weekly active people over ${formatQuantity(weeks.length, WEEKS)}: this department had ${formatCount(first.activeUsers)} at the start and ${formatCount(last.activeUsers)} this week so far`;
    if (first.atOrgRate === null || last.atOrgRate === null) return department;
    return `${department}, against ${formatCount(first.atOrgRate)} and ${formatCount(last.atOrgRate)} at the organization's rate`;
};

// People counted in the headcount who have no account yet, never shown as rows
export const countWithoutAccount = (
    effectiveHeadcount: number | null,
    memberCount: number,
): number =>
    effectiveHeadcount === null
        ? 0
        : Math.max(0, effectiveHeadcount - memberCount);

const MORE_ACCOUNTS_THAN_HEADCOUNT = 'More accounts than headcount';

// Says why coverage reads above 100%; null when it does not
export const getCoverageNote = (
    headcount: number | null,
    memberCount: number,
): string | null =>
    headcount !== null && memberCount > headcount
        ? MORE_ACCOUNTS_THAN_HEADCOUNT
        : null;

// Above 100% the counts behind the share are shown, as the share alone looks like an error
export const formatCoverage = (
    coveragePct: number | null,
    memberCount: number,
    headcount: number | null,
): string =>
    coveragePct !== null && headcount !== null && memberCount > headcount
        ? `${coveragePct}% (${formatCount(memberCount)} of ${formatCount(headcount)})`
        : formatShare(coveragePct, memberCount);

// Captions use the same denominator as the percentage beside them (the headcount)
export const getCoverageCaption = (
    headcount: number | null,
    memberCount: number,
): string => {
    if (headcount === null) return 'Add a headcount to see a percentage';
    return (
        getCoverageNote(headcount, memberCount) ??
        `${formatCount(memberCount)} of ${formatCount(headcount)} people have an account`
    );
};

export const getActiveCaption = (
    headcount: number | null,
    activeCount: number,
    memberCount: number,
): string => {
    const withAccount =
        memberCount === 0
            ? null
            : `${formatCount(activeCount)} of the ${formatCount(memberCount)} with an account`;
    if (headcount === null) {
        return withAccount === null
            ? 'No one has an account yet'
            : `${withAccount} ${activeCount === 1 ? 'was' : 'were'} active`;
    }
    const overall =
        activeCount > headcount
            ? `${formatQuantity(activeCount, PEOPLE)} active, more than the headcount of ${formatCount(headcount)}`
            : `${formatCount(activeCount)} of ${formatCount(headcount)} people ${activeCount === 1 ? 'was' : 'were'} active`;
    return withAccount === null ? overall : `${overall} · ${withAccount}`;
};
