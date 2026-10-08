import {
    getAncestorUuids,
    getChildrenMap,
    getParentMap,
    type DepartmentMember,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import { formatLastActive } from '../utils/departmentDetail';
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

export const formatCount = (count: number): string =>
    count.toLocaleString('en-US');

const plural = (count: number, singular: string, many: string): string =>
    `${formatCount(count)} ${count === 1 ? singular : many}`;

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
): MembersByDepartment =>
    members.reduce<MembersByDepartment>((groups, member) => {
        groups.set(member.departmentUuid, [
            ...(groups.get(member.departmentUuid) ?? []),
            member,
        ]);
        return groups;
    }, new Map());

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
        x: circle.x + position.x,
        y: circle.y + position.y,
        r: dotRadius,
        kind: kinds[index],
        member: members[index] ?? null,
    }));
};

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
            plural(stats.headcount, 'person', 'people'),
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
                ? [
                      plural(
                          circle.childDepartmentCount,
                          'sub-department',
                          'sub-departments',
                      ),
                  ]
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
            ? plural(departmentCount, 'department', 'departments')
            : plural(departmentCount, 'sub-department', 'sub-departments');
    const numbers = [
        ...(departmentCount > 0 ? [departments] : []),
        plural(totals.people, 'person', 'people'),
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
    if (lastActiveAt === null) return 'Never active';
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
