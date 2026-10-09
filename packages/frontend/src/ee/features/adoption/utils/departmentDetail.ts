import {
    assertUnreachable,
    type AdoptionMetrics,
    type DepartmentMember,
    type DepartmentWithMetrics,
    type DepartmentOverlap,
    type DepartmentRef,
    type DepartmentTopContent,
    type DepartmentTopContentItem,
    type DepartmentVennRegion,
    type WeeklyActivePoint,
} from '@lightdash/common';
import { getAiAgentPageBase } from '../../aiCopilot/hooks/aiAgentRouting';
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

// "A", "A and B", "A, B and C"
const formatNames = (names: string[], conjunction: 'and' | 'or'): string =>
    names.length <= 1
        ? names.join('')
        : `${names.slice(0, -1).join(', ')} ${conjunction} ${names[names.length - 1]}`;

const byName = (a: DepartmentRef, b: DepartmentRef): number =>
    a.name.localeCompare(b.name);

const ALSO_IN_NAMES = 3;

// The other departments a person is in, by name; past three the rest are counted and the title names them all
export const formatAlsoIn = (
    departments: DepartmentRef[],
): { text: string; title: string | null } | null => {
    if (departments.length === 0) return null;
    const names = [...departments].sort(byName).map((d) => d.name);
    const all = `Also in ${formatNames(names, 'and')}`;
    const rest = names.length - ALSO_IN_NAMES;
    return rest > 0
        ? {
              text: `Also in ${names.slice(0, ALSO_IN_NAMES).join(', ')} and ${formatCount(rest)} more`,
              title: all,
          }
        : { text: all, title: null };
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

// Captions use the same denominator as the percentage beside them (the headcount); null when none is set, where
// the people on Lightdash are all that is counted
export const getCoverageCaption = (
    headcount: number | null,
    memberCount: number,
): string =>
    headcount === null
        ? `${formatQuantity(memberCount, PEOPLE)} on Lightdash`
        : `${formatCount(memberCount)} of ${formatCount(headcount)} people have an account`;

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
    const overall = `${formatCount(activeCount)} of ${formatCount(headcount)} people ${activeCount === 1 ? 'was' : 'were'} active`;
    // When everyone in the headcount has an account, the share of accounts would only repeat it
    return withAccount === null || headcount === memberCount
        ? overall
        : `${overall} · ${withAccount}`;
};

// A department's numbers on one line: "187 of 420 on Lightdash · 115 active in 30 days · 233 without an account".
// Without a headcount only the people on Lightdash are counted, so nobody is without an account
export const formatDepartmentCounts = ({
    hasHeadcount,
    effectiveHeadcount,
    metrics: { memberCount, activeCount30d },
}: Pick<
    DepartmentWithMetrics,
    'hasHeadcount' | 'effectiveHeadcount' | 'metrics'
>): string => {
    const withoutAccount = hasHeadcount ? effectiveHeadcount - memberCount : 0;
    return [
        hasHeadcount
            ? `${formatCount(memberCount)} of ${formatCount(effectiveHeadcount)} on Lightdash`
            : `${formatCount(memberCount)} on Lightdash`,
        `${formatCount(activeCount30d)} active in 30 days`,
        ...(withoutAccount > 0
            ? [`${formatCount(withoutAccount)} without an account`]
            : []),
    ].join(' · ');
};

// People of this department also in every "with" department and in no "without" one
export type OverlapSelection = {
    withDepartments: DepartmentRef[];
    withoutDepartments: DepartmentRef[];
};

// The people also in one department, whatever else they are in
export const getOverlapSelection = ({
    departmentUuid,
    name,
}: DepartmentRef): OverlapSelection => ({
    withDepartments: [{ departmentUuid, name }],
    withoutDepartments: [],
});

const uuidsOf = (departments: DepartmentRef[]): string =>
    departments
        .map((d) => d.departmentUuid)
        .sort()
        .join(',');

// The same for the same departments in any order
export const getOverlapSelectionKey = ({
    withDepartments,
    withoutDepartments,
}: OverlapSelection): string =>
    `${uuidsOf(withDepartments)}|${uuidsOf(withoutDepartments)}`;

export const isSameSelection = (
    a: OverlapSelection,
    b: OverlapSelection,
): boolean => getOverlapSelectionKey(a) === getOverlapSelectionKey(b);

// The words on the chip that narrows the people to an overlap
export const getOverlapSelectionLabel = ({
    withDepartments,
    withoutDepartments,
}: OverlapSelection): string => {
    const notIn = formatNames(
        withoutDepartments.map((d) => d.name),
        'or',
    );
    if (withDepartments.length === 0) return `Not in ${notIn}`;
    const alsoIn = `Also in ${formatNames(
        withDepartments.map((d) => d.name),
        'and',
    )}`;
    return withoutDepartments.length === 0
        ? alsoIn
        : `${alsoIn}, not in ${notIn}`;
};

export const formatOverlapUsage = ({
    people,
    active30d,
}: Pick<DepartmentOverlap, 'people' | 'active30d'>): string =>
    `${formatQuantity(people, PEOPLE)} · ${formatCount(active30d)} active`;

export const getOverlapRowLabel = (overlap: DepartmentOverlap): string =>
    `${overlap.name}, ${formatQuantity(overlap.people, PEOPLE)}, ${formatCount(overlap.active30d)} active`;

// The department first, then its largest overlaps; null when there is nothing to draw truthfully
export const getVennSets = (
    sets: DepartmentRef[],
    departmentUuid: string,
): DepartmentRef[] | null => {
    const department = sets.find((d) => d.departmentUuid === departmentUuid);
    if (department === undefined || sets.length < 2 || sets.length > 3) {
        return null;
    }
    return [department, ...sets.filter((d) => d !== department)];
};

export const getVennTitle = (sets: DepartmentRef[]): string =>
    `Overlap of ${formatNames(
        sets.map((d) => d.name),
        'and',
    )}`;

const COMPACT_FROM = 10000;

// A count drawn inside the diagram: from 10,000 in thousands to one decimal place ("12.3k"), so it fits its region
export const formatVennCount = (count: number): string => {
    if (count < COMPACT_FROM) return formatCount(count);
    const thousands = Math.round(count / 100) / 10;
    return `${thousands.toLocaleString('en-US', { maximumFractionDigits: 1 })}k`;
};

export type VennRegionView = {
    people: number;
    name: string; // its departments and count, for assistive technology
    selection: OverlapSelection | null; // null when it cannot be listed
};

// A drawn region by the positions of its sets, the department at 0. Only a region holding the department, and
// somebody, can be listed: exactly, as also in its other sets and in none of the rest
export const describeVennRegion = (
    sets: DepartmentRef[],
    regions: DepartmentVennRegion[],
    positions: number[],
): VennRegionView => {
    const inRegion = sets.filter((_, i) => positions.includes(i));
    const key = uuidsOf(inRegion);
    const people =
        regions.find((region) => [...region.sets].sort().join(',') === key)
            ?.people ?? 0;
    const names = inRegion.map((d) => d.name);
    const departments =
        names.length === 1 ? `${names[0]} only` : formatNames(names, 'and');
    return {
        people,
        name: `${departments}, ${formatQuantity(people, PEOPLE)}`,
        selection:
            positions.includes(0) && people > 0
                ? {
                      withDepartments: inRegion.slice(1),
                      withoutDepartments: sets.filter(
                          (_, i) => !positions.includes(i),
                      ),
                  }
                : null,
    };
};
