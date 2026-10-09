import {
    getAncestorUuids,
    getChildrenMap,
    getParentMap,
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
import { type PeopleBreakdown } from '../utils/peopleBreakdown';
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
import { COLOUR_BY_LABELS } from './mapStyles';

// First names are only readable when few people share the map
export const NAME_LABEL_LIMIT = 150;

// The departments one level below the focus: what the map compares
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
    );
    const withoutAccount = Math.max(
        countBucketPeople(circle.people) - members.length,
        0,
    );
    return {
        kinds: [
            ...members.map((member) => getMemberDotKind(member, colourBy)),
            ...Array.from(
                { length: withoutAccount },
                (): DotKind => 'noAccount',
            ),
        ],
        members,
    };
};

// How many dots of each kind are in view
export const countDotKinds = (
    circles: PackedCircle[],
    colourBy: ColourBy,
    membersByDepartment: MembersByDepartment | null,
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
        getCircleDots(circle, colourBy, membersByDepartment).kinds.forEach(
            (kind) => add(kind, 1),
        );
    });
    return counts;
};

// What the legend counts: the panel's numbers, which the dots drawn match, as the server puts each person in the
// bucket and role it counts them in
export const getLegendCounts = (
    breakdown: PeopleBreakdown,
): Map<DotKind, number> =>
    new Map(breakdown.map(({ kind, count }) => [kind, count]));

// Circles drawn with the dashed rings the legend keys; a "Directly in" circle inside another is a plain ring
const isDrawnWithRing = (circle: PackedCircle): boolean =>
    !(circle.kind === 'direct' && circle.depth > 1);

export const getRingKeys = (
    circles: PackedCircle[],
): { hasEmpty: boolean; hasNoHeadcount: boolean } => ({
    hasEmpty: circles.some(
        (circle) => isDrawnWithRing(circle) && !circle.hasMembers,
    ),
    hasNoHeadcount: circles.some(
        (circle) =>
            isDrawnWithRing(circle) &&
            circle.hasMembers &&
            !circle.hasHeadcount,
    ),
});

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
): MapDot[] => {
    const { kinds, members } = getCircleDots(
        circle,
        colourBy,
        membersByDepartment,
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
    // Null without a headcount; for the people directly in a department, the headcount it keeps for them
    headcount: number | null;
    isDirect: boolean;
};

export type CircleInfo = { stats: CircleStats; description: string };

const getCircleStats = (
    circle: PackedCircle,
    byUuid: Map<string, DepartmentWithMetrics>,
): CircleStats | null => {
    // The people directly in a department are counted over the headcount it keeps for them
    if (circle.kind === 'direct' && circle.people !== null) {
        return {
            people: countBucketPeople(circle.people),
            members: circle.people.metrics.memberCount,
            active: circle.people.metrics.activeCount30d,
            headcount: circle.people.headcount,
            isDirect: true,
        };
    }
    // A department, or one without sub-departments drawn as one circle, reads its rolled-up numbers
    const department =
        circle.departmentUuid === null
            ? undefined
            : byUuid.get(circle.departmentUuid);
    if (!department) return null;
    return {
        people: getDepartmentSize(department),
        members: department.metrics.memberCount,
        active: department.metrics.activeCount30d,
        headcount: department.hasHeadcount
            ? department.effectiveHeadcount
            : null,
        isDirect: false,
    };
};

// The people directly in a department, over the headcount it keeps for them when one is entered in it
export const formatDirectPeople = (
    members: number,
    headcount: number | null,
    active: number,
): string =>
    `${formatCount(members)}${headcount === null ? '' : ` of ${formatCount(headcount)}`} on Lightdash · ${members > 0 && active === members ? 'all active' : `${formatCount(active)} active`}`;

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

const counted = (noun: Noun) => (count: number) => formatQuantity(count, noun);
const named = (name: string) => (count: number) =>
    `${formatCount(count)} ${name}`;

// Each part of a colouring as it is read out, with its count
const SPOKEN_KINDS: Record<DotKind, (count: number) => string> = {
    healthy: named('healthy'),
    atRisk: named('at risk'),
    lost: named('lost'),
    admin: counted({ one: 'admin', other: 'admins' }),
    editor: counted({ one: 'editor', other: 'editors' }),
    interactiveViewer: counted({
        one: 'interactive viewer',
        other: 'interactive viewers',
    }),
    viewer: counted({ one: 'viewer', other: 'viewers' }),
    noAccount: named('with no account'),
};

export const buildMapAriaLabel = ({
    scopeName,
    departmentCount,
    totals,
    areDotsHidden,
    colourBy,
    breakdown,
    hasHeadcount,
}: {
    scopeName: string | null; // null at the top of the organization
    departmentCount: number;
    totals: ViewTotals;
    areDotsHidden: boolean;
    colourBy: ColourBy;
    // The people in view, in the parts their dots are coloured by
    breakdown: PeopleBreakdown;
    // Without a headcount in view nobody is counted without an account, which the panel says too
    hasHeadcount: boolean;
}): string => {
    const departments =
        scopeName === null
            ? formatQuantity(departmentCount, DEPARTMENTS)
            : formatQuantity(departmentCount, SUB_DEPARTMENTS);
    const numbers = [
        ...(departmentCount > 0 ? [departments] : []),
        formatQuantity(totals.people, PEOPLE),
        // Across the organization only the people placed in a department are on the map
        scopeName === null
            ? `${formatCount(totals.members)} on Lightdash placed in a department`
            : `${formatCount(totals.members)} on Lightdash`,
        `${formatCount(totals.active)} active in the last 30 days`,
    ].join(', ');
    const colouring = `${COLOUR_BY_LABELS[colourBy].toLowerCase()}: ${breakdown
        .map(({ kind, count }) =>
            kind === 'noAccount' && !hasHeadcount
                ? 'no headcount set'
                : SPOKEN_KINDS[kind](count),
        )
        .join(', ')}`;
    const encoding = areDotsHidden
        ? 'Each circle is a department sized by headcount'
        : `Each circle is a department sized by headcount and each dot is a person, coloured by ${colouring}`;
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
