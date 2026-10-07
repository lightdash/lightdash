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
const ACTIVE_DAYS = 30;
const LAPSED_DAYS = 84;
const LABEL_PX_PER_CHAR = 3.6;

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

export const getDotRadius = (count: number, radius: number): number =>
    count <= 0
        ? 0
        : Math.min(Math.max((radius / Math.sqrt(count)) * 0.6, 0.75), 5);

// Dots plus their own radius sit inside the circle, with a margin at the edge
export const layoutDots = (
    count: number,
    circleRadius: number,
): { dotRadius: number; positions: { x: number; y: number }[] } => {
    if (count <= 0) return { dotRadius: 0, positions: [] };
    const usable = Math.max(circleRadius - DOT_MARGIN, 0);
    const dotRadius = Math.min(getDotRadius(count, usable), usable / 2);
    return {
        dotRadius,
        positions: sunflowerPositions(count, Math.max(usable - dotRadius, 0)),
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

export const getMemberDotKind = (
    member: Pick<DepartmentMember, 'role' | 'lastActiveAt'>,
    colourBy: ColourBy,
    now: Date = new Date(),
): DotKind => {
    const daysSince =
        member.lastActiveAt === null
            ? Number.POSITIVE_INFINITY
            : (now.getTime() - Date.parse(member.lastActiveAt)) / MS_PER_DAY;
    switch (colourBy) {
        case 'active':
            return daysSince <= ACTIVE_DAYS ? 'active' : 'idle';
        case 'role':
            return roleKind(member.role);
        case 'lastActive':
            if (daysSince <= ACTIVE_DAYS) return 'active';
            return daysSince <= LAPSED_DAYS ? 'lapsed' : 'inactive';
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
