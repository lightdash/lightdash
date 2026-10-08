import {
    assertUnreachable,
    type AdoptionMetrics,
    type DepartmentMember,
    type DepartmentTopContent,
    type DepartmentTopContentItem,
    type WeeklyActivePoint,
} from '@lightdash/common';
import { getAiAgentPageBase } from '../../aiCopilot/hooks/aiAgentRouting';
import { formatShare } from './departmentRows';
import {
    formatCount,
    formatQuantity,
    PEOPLE,
    WEEKS,
    type Noun,
} from './format';

export type MemberFilter =
    | 'all'
    | 'active30d'
    | 'inactive30d'
    | 'noRecordedActivity';

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

// No activity in 90 days first, then the longest quiet; ties by email
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
    if (lastActiveAt === null) return 'No activity in 90 days';
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

export const formatTopContentUsage = (
    item: Pick<DepartmentTopContentItem, 'count' | 'distinctPeople'>,
    noun: Noun,
): string =>
    `${formatQuantity(item.count, noun)} · ${formatQuantity(item.distinctPeople, PEOPLE)}`;

export type TopContentKind = keyof DepartmentTopContent;

// Built from the ids and the explore's name alone, each one encoded, so a name can never become a URL
export const getTopContentPath = (
    kind: TopContentKind,
    item: Pick<DepartmentTopContentItem, 'id' | 'name' | 'projectUuid'>,
): string => {
    const project = encodeURIComponent(item.projectUuid);
    switch (kind) {
        case 'dashboards':
            return `/projects/${project}/dashboards/${encodeURIComponent(item.id)}/view`;
        case 'explores':
            return `/projects/${project}/tables/${encodeURIComponent(item.name)}`;
        case 'aiAgents':
            return `${getAiAgentPageBase(project, false)}/${encodeURIComponent(item.id)}`;
        default:
            return assertUnreachable(kind, `Unknown content ${kind}`);
    }
};

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
        // With nobody on Lightdash here the line would sit at zero under the department's own, so none is drawn
        if (
            organization === null ||
            active === undefined ||
            memberCount === 0
        ) {
            return null;
        }
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

// One series at the hovered week, as the chart's tooltip receives it
export type TooltipPoint = { seriesName: string; value: number | null };

// Only the lines still shown are listed, as the legend can hide either one
export const getWeekTooltipRows = (
    label: string,
    points: TooltipPoint[],
): string[] => {
    // The week so far is a second series under the same name, so the first count given wins
    const counts = new Map<string, number>();
    points.forEach(({ seriesName, value }) => {
        if (value !== null && !counts.has(seriesName)) {
            counts.set(seriesName, value);
        }
    });
    const rows = [THIS_DEPARTMENT, AT_ORG_RATE].flatMap((name) => {
        const count = counts.get(name);
        return count === undefined ? [] : [`${name}: ${formatCount(count)}`];
    });
    return rows.length > 0 ? [label, ...rows] : [];
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
    // Above the headcount the caption says why, as the coverage caption does
    const overall =
        getCoverageNote(headcount, activeCount) ??
        `${formatCount(activeCount)} of ${formatCount(headcount)} people ${activeCount === 1 ? 'was' : 'were'} active`;
    return withAccount === null ? overall : `${overall} · ${withAccount}`;
};
