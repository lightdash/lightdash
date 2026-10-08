import {
    getAncestorUuids,
    getChildrenMap,
    getParentMap,
    type AdoptionMetrics,
    type DepartmentMember,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import { formatLastActive } from '../utils/departmentDetail';
import {
    DEPARTMENTS,
    formatCount,
    formatQuantity,
    PEOPLE,
    SUB_DEPARTMENTS,
    type Noun,
} from '../utils/format';
import {
    countBucketPeople,
    getDepartmentSize,
    getDotSegments,
    getMemberDotKind,
    layoutDots,
    orderMembersForDots,
    type ColourBy,
    type DotKind,
    type PackedCircle,
} from './geometry';

// First names are only readable when few people share the map
export const NAME_LABEL_LIMIT = 150;

const ACCOUNTS: Noun = { one: 'account', other: 'accounts' };

// The departments one level below the focus: what the map and its cards compare
export const getVisibleDepartments = (
    departments: DepartmentWithMetrics[],
    focusUuid: string | null,
): DepartmentWithMetrics[] => {
    const byUuid = new Map(departments.map((d) => [d.departmentUuid, d]));
    return (getChildrenMap(departments).get(focusUuid) ?? []).flatMap(
        (uuid) => {
            const department = byUuid.get(uuid);
            return department ? [department] : [];
        },
    );
};

// Ancestors from the top down, ending at the focused department
export const getFocusTrail = (
    departments: DepartmentWithMetrics[],
    focusUuid: string | null,
): DepartmentWithMetrics[] => {
    const byUuid = new Map(departments.map((d) => [d.departmentUuid, d]));
    if (focusUuid === null || !byUuid.has(focusUuid)) return [];
    return [
        ...getAncestorUuids(focusUuid, getParentMap(departments)).reverse(),
        focusUuid,
    ].flatMap((uuid) => {
        const department = byUuid.get(uuid);
        return department ? [department] : [];
    });
};

export type MembersByDepartment = Map<string, DepartmentMember[]>;

export const groupMembersByDepartment = (
    members: DepartmentMember[],
): MembersByDepartment => {
    const groups: MembersByDepartment = new Map();
    members.forEach((member) => {
        const group = groups.get(member.departmentUuid);
        if (group) group.push(member);
        else groups.set(member.departmentUuid, [member]);
    });
    return groups;
};

type CircleDots = { kinds: DotKind[]; members: DepartmentMember[] };

// Loaded people colour their own dots; otherwise the summary counts do
const getCircleDots = (
    circle: PackedCircle,
    colourBy: ColourBy,
    membersByDepartment: MembersByDepartment | null,
    now: Date,
): CircleDots => {
    if (circle.people === null) return { kinds: [], members: [] };
    if (membersByDepartment === null || circle.departmentUuid === null) {
        return {
            kinds: getDotSegments(circle.people, colourBy).flatMap((segment) =>
                Array.from(
                    { length: Math.max(segment.count, 0) },
                    () => segment.kind,
                ),
            ),
            members: [],
        };
    }
    const members = orderMembersForDots(
        membersByDepartment.get(circle.departmentUuid) ?? [],
        colourBy,
        now,
    );
    const withoutAccount = Math.max(
        countBucketPeople(circle.people) - members.length,
        0,
    );
    return {
        kinds: [
            ...members.map((member) => getMemberDotKind(member, colourBy, now)),
            ...Array.from(
                { length: withoutAccount },
                (): DotKind => 'noAccount',
            ),
        ],
        members,
    };
};

// What the legend shows: how many dots of each kind are in view
export const countDotKinds = (
    circles: PackedCircle[],
    colourBy: ColourBy,
    membersByDepartment: MembersByDepartment | null,
    now: Date = new Date(),
): Map<DotKind, number> => {
    const counts = new Map<DotKind, number>();
    const add = (kind: DotKind, count: number) =>
        counts.set(kind, (counts.get(kind) ?? 0) + Math.max(count, 0));
    circles.forEach((circle) => {
        if (circle.people === null) return;
        if (membersByDepartment === null) {
            // Counted without expanding, so it stays cheap above the dot limit
            getDotSegments(circle.people, colourBy).forEach((segment) =>
                add(segment.kind, segment.count),
            );
            return;
        }
        getCircleDots(circle, colourBy, membersByDepartment, now).kinds.forEach(
            (kind) => add(kind, 1),
        );
    });
    return counts;
};

export type MapDot = {
    key: string;
    // The circle the dot is drawn in
    circleId: string;
    x: number;
    y: number;
    r: number;
    kind: DotKind;
    member: DepartmentMember | null;
};

export const buildDots = (
    circle: PackedCircle,
    colourBy: ColourBy,
    membersByDepartment: MembersByDepartment | null,
    now: Date = new Date(),
): MapDot[] => {
    const { kinds, members } = getCircleDots(
        circle,
        colourBy,
        membersByDepartment,
        now,
    );
    const { dotRadius, positions } = layoutDots(kinds.length, circle.r);
    return positions.map((position, index) => ({
        key: `${circle.id}:${index}`,
        circleId: circle.id,
        x: circle.x + position.x,
        y: circle.y + position.y,
        r: dotRadius,
        kind: kinds[index],
        member: members[index] ?? null,
    }));
};

// People are only fetched where their names can be drawn; larger views are coloured from the summary counts
export const shouldLoadPeople = (totalPeople: number): boolean =>
    totalPeople <= NAME_LABEL_LIMIT;

export const shouldShowNames = (
    totalPeople: number,
    hasLoadedPeople: boolean,
): boolean => hasLoadedPeople && totalPeople <= NAME_LABEL_LIMIT;

export type CircleStats = {
    people: number;
    members: number;
    active: number;
    headcount: number | null;
};

export type CircleInfo = { stats: CircleStats; description: string };

const getCircleStats = (
    circle: PackedCircle,
    byUuid: Map<string, DepartmentWithMetrics>,
): CircleStats | null => {
    // A bucket of people carries its own numbers; a parent circle reads its rolled-up ones
    if (circle.kind === 'own' && circle.people !== null) {
        return {
            people: countBucketPeople(circle.people),
            members: circle.people.metrics.memberCount,
            active: circle.people.metrics.activeCount30d,
            headcount: circle.people.headcount,
        };
    }
    const department =
        circle.departmentUuid === null
            ? undefined
            : byUuid.get(circle.departmentUuid);
    if (!department) return null;
    return {
        people: Math.max(
            getDepartmentSize(department),
            department.metrics.memberCount,
        ),
        members: department.metrics.memberCount,
        active: department.metrics.activeCount30d,
        headcount: department.effectiveHeadcount,
    };
};

const describeStats = (stats: CircleStats): string[] => {
    const active = `${formatCount(stats.active)} active in the last 30 days`;
    if (stats.headcount === null) {
        return stats.members === 0
            ? ['nobody on Lightdash yet', 'no headcount set']
            : [
                  `${formatCount(stats.members)} on Lightdash`,
                  active,
                  'no headcount set',
              ];
    }
    if (stats.members === 0) {
        return [
            formatQuantity(stats.headcount, PEOPLE),
            'nobody on Lightdash yet',
        ];
    }
    return [
        `${formatCount(stats.members)} of ${formatCount(stats.headcount)} on Lightdash`,
        active,
    ];
};

// The numbers and the spoken name of every circle, keyed by circle id
export const describeCircles = (
    circles: PackedCircle[],
    byUuid: Map<string, DepartmentWithMetrics>,
): Map<string, CircleInfo> =>
    circles.reduce<Map<string, CircleInfo>>((info, circle) => {
        const stats = getCircleStats(circle, byUuid);
        if (stats === null) return info;
        const parts = [
            circle.name,
            ...describeStats(stats),
            ...(circle.childDepartmentCount > 0
                ? [formatQuantity(circle.childDepartmentCount, SUB_DEPARTMENTS)]
                : []),
            ...(circle.isAreaHonest ? [] : ['not to scale']),
        ];
        info.set(circle.id, { stats, description: parts.join(', ') });
        return info;
    }, new Map());

export type ViewTotals = { people: number; members: number; active: number };

export const getViewTotals = (circles: PackedCircle[]): ViewTotals =>
    circles.reduce<ViewTotals>(
        (totals, circle) =>
            circle.people === null
                ? totals
                : {
                      people: totals.people + countBucketPeople(circle.people),
                      members:
                          totals.members + circle.people.metrics.memberCount,
                      active:
                          totals.active + circle.people.metrics.activeCount30d,
                  },
        { people: 0, members: 0, active: 0 },
    );

export type OrganizationOverview = {
    // The page header's two numbers, for everyone on Lightdash
    onLightdash: number;
    active30d: number;
    placed: number;
    // The legend's "No account": headcount without an account in every circle drawn
    withoutAccount: number;
    // The top-level departments' effective headcounts added up, or null when none has one
    headcount: number | null;
    // What makes placed = headcount - without an account + these two: people placed beyond
    // headcount, and people in top-level departments without one
    aboveHeadcount: number;
    withoutHeadcount: number;
    // A headcount entered below its sub-departments' total also counts towards aboveHeadcount
    hasHeadcountBelowSubDepartments: boolean;
};

// Totals reads the circles of the whole organization, as the legend does
export const getOrganizationOverview = (
    organization: AdoptionMetrics,
    departments: DepartmentWithMetrics[],
    totals: ViewTotals,
): OrganizationOverview => {
    const topLevel = getVisibleDepartments(departments, null);
    const counted = topLevel.filter(
        (department) => department.effectiveHeadcount !== null,
    );
    const headcount = counted.reduce(
        (sum, department) => sum + (department.effectiveHeadcount ?? 0),
        0,
    );
    const withoutHeadcount = topLevel
        .filter((department) => department.effectiveHeadcount === null)
        .reduce((sum, department) => sum + department.metrics.memberCount, 0);
    const withoutAccount = Math.max(totals.people - totals.members, 0);
    return {
        onLightdash: organization.memberCount,
        active30d: organization.activeCount30d,
        placed: totals.members,
        withoutAccount,
        headcount: counted.length > 0 ? headcount : null,
        aboveHeadcount: Math.max(
            totals.members - headcount + withoutAccount - withoutHeadcount,
            0,
        ),
        withoutHeadcount,
        hasHeadcountBelowSubDepartments: departments.some(
            (department) => department.headcountBelowChildren,
        ),
    };
};

export type OrganizationOverviewCopy = {
    placed: string;
    withoutAccount: string | null;
    captions: string[];
};

export const describeOrganizationOverview = (
    overview: OrganizationOverview,
): OrganizationOverviewCopy => {
    const placed = `Placed in a department: ${formatCount(overview.placed)} of ${formatCount(overview.onLightdash)} on Lightdash`;
    if (overview.headcount === null) {
        return { placed, withoutAccount: null, captions: [] };
    }
    const { aboveHeadcount, withoutHeadcount } = overview;
    const excluded = overview.hasHeadcountBelowSubDepartments
        ? `Excludes ${formatQuantity(aboveHeadcount, PEOPLE)} counted above their department's headcount or below its sub-departments' total`
        : `Excludes ${formatQuantity(aboveHeadcount, ACCOUNTS)} above their department's headcount`;
    return {
        placed,
        withoutAccount: `Without an account: ${formatCount(overview.withoutAccount)} of ${formatCount(overview.headcount)} headcount`,
        captions: [
            ...(aboveHeadcount > 0 ? [excluded] : []),
            ...(withoutHeadcount > 0
                ? [
                      withoutHeadcount === 1
                          ? '1 person is in a department without a headcount'
                          : `${formatQuantity(withoutHeadcount, PEOPLE)} are in departments without a headcount`,
                  ]
                : []),
        ],
    };
};

export const buildMapAriaLabel = ({
    scopeName,
    departmentCount,
    totals,
    areDotsHidden,
}: {
    scopeName: string | null; // null at the top of the organization
    departmentCount: number;
    totals: ViewTotals;
    areDotsHidden: boolean;
}): string => {
    const departments =
        scopeName === null
            ? formatQuantity(departmentCount, DEPARTMENTS)
            : formatQuantity(departmentCount, SUB_DEPARTMENTS);
    const numbers = [
        ...(departmentCount > 0 ? [departments] : []),
        formatQuantity(totals.people, PEOPLE),
        `${formatCount(totals.members)} on Lightdash`,
        `${formatCount(totals.active)} active in the last 30 days`,
    ].join(', ');
    const encoding = areDotsHidden
        ? 'Each circle is a department sized by headcount'
        : 'Each circle is a department sized by headcount and each dot is a person';
    return `Map of ${scopeName ?? 'the organization'}: ${numbers}. ${encoding}. The List view has the same numbers as a table`;
};

// A share that rounds to 0% but has people in it reads "<1%", never "0%"
export const formatPct = (pct: number | null, count: number): string | null => {
    if (pct === null) return null;
    return pct === 0 && count > 0 ? '<1%' : `${pct}%`;
};

export const formatMemberActivity = (
    lastActiveAt: string | null,
    now: Date = new Date(),
): string => {
    if (lastActiveAt === null) return 'No activity in 90 days';
    const when = formatLastActive(lastActiveAt, now);
    // Relative days read as part of the sentence; a date keeps its capitals
    return `Last active ${/^[A-Z][a-z]+$/.test(when) ? when.toLowerCase() : when}`;
};

// A department with no sub-departments is drawn as one circle, which carries the department's own name
export const nameLoneBucket = (
    circles: PackedCircle[],
    focusName: string | null,
): PackedCircle[] =>
    focusName !== null && circles.length === 1 && circles[0].kind === 'own'
        ? [{ ...circles[0], name: focusName }]
        : circles;

// Lowest coverage first; among equals the biggest department leads, and those without a headcount go last
export const sortForInspector = (
    departments: DepartmentWithMetrics[],
): DepartmentWithMetrics[] =>
    [...departments].sort((a, b) => {
        const left = a.metrics.coveragePct;
        const right = b.metrics.coveragePct;
        if (left === null || right === null) {
            if (left === right) return a.name.localeCompare(b.name);
            return left === null ? 1 : -1;
        }
        return (
            left - right ||
            (b.effectiveHeadcount ?? 0) - (a.effectiveHeadcount ?? 0) ||
            a.name.localeCompare(b.name)
        );
    });
