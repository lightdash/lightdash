import {
    assertUnreachable,
    getChildrenMap,
    OrganizationMemberRole,
    type AdoptionMetrics,
    type DepartmentMember,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import { hierarchy, pack } from 'd3-hierarchy';

export const MAP_SIZE = 720;
export const MIN_CIRCLE_RADIUS = 14;
// Above this many dots SVG gets slow; canvas rendering is a follow-up
export const SVG_DOT_LIMIT = 5000;

const CIRCLE_PADDING = 8;
const DOT_MARGIN = 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LAPSED_DAYS = 84;
const LABEL_PX_PER_CHAR = 3.6;
const ROOMY_DOT_RADIUS = 11;
const DENSE_DOT_RADIUS = 5;
const ROOMY_COUNT = 20;
const DENSE_COUNT = 150;
// Up to this many people sit on a ring; at exactly this many one of them takes the centre
const RING_WITH_CENTRE_COUNT = 7;
// Centres are kept this multiple of a dot's diameter apart, so neighbours never touch
const DOT_SPACING = 1.06;

export type ColourBy = 'active' | 'role' | 'lastActive';

export type DotKind =
    | 'active'
    | 'idle'
    | 'lapsed'
    | 'inactive'
    | 'admin'
    | 'editor'
    | 'interactiveViewer'
    | 'viewer'
    | 'noAccount';

export type DotSegment = { kind: DotKind; count: number };

export type PeopleBucket = {
    metrics: AdoptionMetrics;
    headcount: number | null;
};

export type PackDatum = {
    id: string;
    kind: 'root' | 'department' | 'own';
    departmentUuid: string | null;
    name: string;
    hasHeadcount: boolean;
    hasMembers: boolean;
    childDepartmentCount: number;
    people: PeopleBucket | null;
    children: PackDatum[];
};

export type PackedCircle = Omit<PackDatum, 'children'> & {
    depth: number;
    x: number;
    y: number;
    r: number;
    isAreaHonest: boolean;
};

// Core first: this is also the order dots are laid out from the centre
const DOT_ORDER: DotKind[] = [
    'active',
    'lapsed',
    'admin',
    'editor',
    'interactiveViewer',
    'viewer',
    'idle',
    'inactive',
    'noAccount',
];

export const getDepartmentSize = (department: DepartmentWithMetrics): number =>
    department.effectiveHeadcount ?? department.metrics.memberCount;

export const countBucketPeople = (bucket: PeopleBucket): number =>
    Math.max(bucket.headcount ?? 0, bucket.metrics.memberCount);

export const getDotSegments = (
    bucket: PeopleBucket,
    colourBy: ColourBy,
): DotSegment[] => {
    const { metrics } = bucket;
    const noAccount: DotSegment = {
        kind: 'noAccount',
        count: countBucketPeople(bucket) - metrics.memberCount,
    };
    switch (colourBy) {
        case 'active':
            return [
                { kind: 'active', count: metrics.activeCount30d },
                {
                    kind: 'idle',
                    count: metrics.memberCount - metrics.activeCount30d,
                },
                noAccount,
            ];
        case 'role':
            return [
                { kind: 'admin', count: metrics.roleSplit.admins },
                { kind: 'editor', count: metrics.roleSplit.editors },
                {
                    kind: 'interactiveViewer',
                    count: metrics.roleSplit.interactiveViewers,
                },
                { kind: 'viewer', count: metrics.roleSplit.viewers },
                noAccount,
            ];
        case 'lastActive':
            return [
                { kind: 'active', count: metrics.activeCount30d },
                {
                    kind: 'lapsed',
                    count: metrics.activeCount12w - metrics.activeCount30d,
                },
                {
                    kind: 'inactive',
                    count: metrics.memberCount - metrics.activeCount12w,
                },
                noAccount,
            ];
        default:
            return assertUnreachable(colourBy, 'Unknown colouring');
    }
};

export const expandDots = (segments: DotSegment[]): DotKind[] =>
    segments.flatMap((segment) =>
        Array.from({ length: Math.max(segment.count, 0) }, () => segment.kind),
    );

export const sunflowerPositions = (
    count: number,
    radius: number,
): { x: number; y: number }[] =>
    Array.from({ length: Math.max(count, 0) }, (_, index) => {
        const distance = radius * Math.sqrt((index + 0.5) / count);
        const angle = index * GOLDEN_ANGLE;
        return {
            x: distance * Math.cos(angle),
            y: distance * Math.sin(angle),
        };
    });

// A handful of people get dots big enough to read as people; the cap eases down as the count grows
const getDotRadiusCap = (count: number): number => {
    const roominess = Math.min(
        Math.max((DENSE_COUNT - count) / (DENSE_COUNT - ROOMY_COUNT), 0),
        1,
    );
    return DENSE_DOT_RADIUS + (ROOMY_DOT_RADIUS - DENSE_DOT_RADIUS) * roominess;
};

export const getDotRadius = (count: number, radius: number): number =>
    count <= 0
        ? 0
        : Math.min(
              Math.max((radius / Math.sqrt(count)) * 0.6, 0.75),
              getDotRadiusCap(count),
          );

type DotLayout = { dotRadius: number; positions: { x: number; y: number }[] };

// A few people sit evenly on a ring, the first at the top; from seven up one takes the centre
const layoutFewDots = (count: number, usable: number): DotLayout => {
    if (count === 1) {
        return {
            dotRadius: Math.min(usable / 2, getDotRadiusCap(count)),
            positions: [{ x: 0, y: 0 }],
        };
    }
    const onRing = count === RING_WITH_CENTRE_COUNT ? count - 1 : count;
    // Half the distance between ring neighbours, per unit of ring radius
    const reach = Math.sin(Math.PI / onRing);
    const dotRadius = Math.min(
        (usable * reach) / (1 + reach) / DOT_SPACING,
        getDotRadiusCap(count),
    );
    // Halfway out where there is room, never closer than the dots need nor past the edge
    const ringRadius = Math.min(
        Math.max(usable / 2, (dotRadius * DOT_SPACING) / reach),
        usable - dotRadius,
    );
    const ring = Array.from({ length: onRing }, (_, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / onRing;
        return {
            x: ringRadius * Math.cos(angle),
            y: ringRadius * Math.sin(angle),
        };
    });
    return {
        dotRadius,
        positions: onRing === count ? ring : [{ x: 0, y: 0 }, ...ring],
    };
};

const FIBONACCI = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987];
const sunflowerSpacings = new Map<number, number>();

// The closest any two dots of a sunflower come, for a sunflower of radius 1.
// A dot's nearest neighbours are a Fibonacci number of steps along the spiral.
export const getSunflowerSpacing = (count: number): number => {
    const known = sunflowerSpacings.get(count);
    if (known !== undefined) return known;
    const positions = sunflowerPositions(count, 1);
    let closest = Number.POSITIVE_INFINITY;
    positions.forEach((position, index) => {
        FIBONACCI.forEach((step) => {
            const other = positions[index + step];
            if (!other) return;
            closest = Math.min(
                closest,
                Math.hypot(position.x - other.x, position.y - other.y),
            );
        });
    });
    sunflowerSpacings.set(count, closest);
    return closest;
};

// Dots never overlap and stay inside the circle with a margin at the edge: the radius is
// worked out from how close the positions actually come, then held to the readable sizes
export const layoutDots = (count: number, circleRadius: number): DotLayout => {
    if (count <= 0) return { dotRadius: 0, positions: [] };
    const usable = Math.max(circleRadius - DOT_MARGIN, 0);
    if (count <= RING_WITH_CENTRE_COUNT) return layoutFewDots(count, usable);
    // Positions spread to (usable - dotRadius), so the largest radius that fits solves for both
    const spacing = getSunflowerSpacing(count);
    const fitting = (usable * spacing) / (2 * DOT_SPACING + spacing);
    const dotRadius = Math.min(fitting, getDotRadius(count, usable));
    return {
        dotRadius,
        positions: sunflowerPositions(count, usable - dotRadius),
    };
};

export const buildPackInput = (
    departments: DepartmentWithMetrics[],
    focusUuid: string | null,
): PackDatum => {
    const children = getChildrenMap(departments);
    const byUuid = new Map(departments.map((d) => [d.departmentUuid, d]));
    const lookup = (uuids: string[] | undefined): DepartmentWithMetrics[] =>
        (uuids ?? []).flatMap((uuid) => {
            const department = byUuid.get(uuid);
            return department ? [department] : [];
        });

    // People who belong to a department itself rather than a sub-department
    const ownBucket = (department: DepartmentWithMetrics): PackDatum | null => {
        const childrenSize = lookup(children.get(department.departmentUuid))
            .map(getDepartmentSize)
            .reduce((sum, size) => sum + size, 0);
        const ownPeople = Math.max(
            getDepartmentSize(department) - childrenSize,
            department.directMetrics.memberCount,
        );
        if (ownPeople <= 0) return null;
        return {
            id: `own:${department.departmentUuid}`,
            kind: 'own',
            departmentUuid: department.departmentUuid,
            name: `Directly in ${department.name}`,
            hasHeadcount: department.effectiveHeadcount !== null,
            hasMembers: department.directMetrics.memberCount > 0,
            childDepartmentCount: 0,
            people: {
                metrics: department.directMetrics,
                headcount:
                    department.effectiveHeadcount === null ? null : ownPeople,
            },
            children: [],
        };
    };

    const toDatum = (
        department: DepartmentWithMetrics,
        path: Set<string>,
    ): PackDatum => {
        const childDepartments = lookup(
            children.get(department.departmentUuid),
        ).filter((child) => !path.has(child.departmentUuid));
        const base = {
            id: department.departmentUuid,
            kind: 'department' as const,
            departmentUuid: department.departmentUuid,
            name: department.name,
            hasHeadcount: department.effectiveHeadcount !== null,
            hasMembers: department.metrics.memberCount > 0,
            childDepartmentCount: childDepartments.length,
        };
        if (childDepartments.length === 0) {
            return {
                ...base,
                people: {
                    metrics: department.metrics,
                    headcount: department.effectiveHeadcount,
                },
                children: [],
            };
        }
        const own = ownBucket(department);
        return {
            ...base,
            people: null,
            children: [
                ...childDepartments.map((child) =>
                    toDatum(child, new Set([...path, child.departmentUuid])),
                ),
                ...(own ? [own] : []),
            ],
        };
    };

    const focus = focusUuid === null ? null : (byUuid.get(focusUuid) ?? null);
    const topLevel = lookup(children.get(focus?.departmentUuid ?? null));
    const focusOwn = focus === null ? null : ownBucket(focus);
    return {
        id: 'root',
        kind: 'root',
        departmentUuid: focus?.departmentUuid ?? null,
        name: focus?.name ?? 'All departments',
        hasHeadcount: true,
        hasMembers: true,
        childDepartmentCount: topLevel.length,
        people: null,
        children: [
            ...topLevel.map((department) =>
                toDatum(department, new Set([department.departmentUuid])),
            ),
            ...(focusOwn ? [focusOwn] : []),
        ],
    };
};

const MAX_PACK_PASSES = 8;

export const layoutPack = (
    input: PackDatum,
    size: number = MAP_SIZE,
    minRadius: number = MIN_CIRCLE_RADIUS,
): PackedCircle[] => {
    if (input.children.length === 0) return [];
    const trueValue = (datum: PackDatum): number =>
        datum.people === null
            ? 0
            : Math.max(countBucketPeople(datum.people), 1);
    // Packing values start at the people count and are raised for leaves that
    // would draw below the minimum radius, so packing itself keeps them apart
    const packValues = new Map<string, number>();
    const packOnce = () =>
        pack<PackDatum>().size([size, size]).padding(CIRCLE_PADDING)(
            hierarchy(input).sum(
                (datum) => packValues.get(datum.id) ?? trueValue(datum),
            ),
        );

    let packed = packOnce();
    for (let pass = 0; pass < MAX_PACK_PASSES; pass += 1) {
        let raised = false;
        packed.leaves().forEach((leaf) => {
            const value = packValues.get(leaf.data.id) ?? trueValue(leaf.data);
            if (leaf.r >= minRadius - 1e-6 || value <= 0) return;
            // Radius is proportional to sqrt(value), so scale value by the squared shortfall
            packValues.set(
                leaf.data.id,
                value * (minRadius / leaf.r) ** 2 * 1.001,
            );
            raised = true;
        });
        if (!raised) break;
        packed = packOnce();
    }

    // A node is not to scale if its own value or any descendant's was raised
    const inflated = new Set<string>();
    packed.eachAfter((node) => {
        if (
            packValues.has(node.data.id) ||
            (node.children ?? []).some((child) => inflated.has(child.data.id))
        ) {
            inflated.add(node.data.id);
        }
    });

    return packed
        .descendants()
        .filter((node) => node.depth > 0)
        .map((node) => ({
            id: node.data.id,
            kind: node.data.kind,
            departmentUuid: node.data.departmentUuid,
            name: node.data.name,
            hasHeadcount: node.data.hasHeadcount,
            hasMembers: node.data.hasMembers,
            childDepartmentCount: node.data.childDepartmentCount,
            people: node.data.people,
            depth: node.depth,
            x: node.x,
            y: node.y,
            r: node.r,
            // Small departments stay clickable, at the cost of honest area
            isAreaHonest: !inflated.has(node.data.id),
        }));
};

export const countPeople = (circles: PackedCircle[]): number =>
    circles.reduce(
        (sum, circle) =>
            sum +
            (circle.people === null ? 0 : countBucketPeople(circle.people)),
        0,
    );

export const shouldRenderDots = (totalPeople: number): boolean =>
    totalPeople <= SVG_DOT_LIMIT;

const roleKind = (role: OrganizationMemberRole): DotKind => {
    switch (role) {
        case OrganizationMemberRole.MEMBER:
        case OrganizationMemberRole.VIEWER:
            return 'viewer';
        case OrganizationMemberRole.INTERACTIVE_VIEWER:
            return 'interactiveViewer';
        case OrganizationMemberRole.EDITOR:
        case OrganizationMemberRole.DEVELOPER:
            return 'editor';
        case OrganizationMemberRole.ADMIN:
            return 'admin';
        default:
            return assertUnreachable(role, 'Unknown role');
    }
};

// Active in 30 days is the server's flag; only the 12-week split still reads the timestamp
export const getMemberDotKind = (
    member: Pick<DepartmentMember, 'role' | 'lastActiveAt' | 'isActive30d'>,
    colourBy: ColourBy,
    now: Date = new Date(),
): DotKind => {
    switch (colourBy) {
        case 'active':
            return member.isActive30d ? 'active' : 'idle';
        case 'role':
            return roleKind(member.role);
        case 'lastActive': {
            if (member.isActive30d) return 'active';
            const daysSince =
                member.lastActiveAt === null
                    ? Number.POSITIVE_INFINITY
                    : (now.getTime() - Date.parse(member.lastActiveAt)) /
                      MS_PER_DAY;
            return daysSince <= LAPSED_DAYS ? 'lapsed' : 'inactive';
        }
        default:
            return assertUnreachable(colourBy, 'Unknown colouring');
    }
};

export const orderMembersForDots = (
    members: DepartmentMember[],
    colourBy: ColourBy,
    now: Date = new Date(),
): DepartmentMember[] =>
    [...members].sort(
        (a, b) =>
            DOT_ORDER.indexOf(getMemberDotKind(a, colourBy, now)) -
            DOT_ORDER.indexOf(getMemberDotKind(b, colourBy, now)),
    );

export const truncateLabel = (name: string, radius: number): string => {
    const maxChars = Math.max(Math.floor(radius / LABEL_PX_PER_CHAR), 3);
    return name.length <= maxChars
        ? name
        : `${name.slice(0, maxChars - 1).trimEnd()}…`;
};
