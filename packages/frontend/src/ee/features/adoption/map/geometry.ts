import {
    assertUnreachable,
    getChildrenMap,
    getResidualHeadcount,
    OrganizationMemberRole,
    type AdoptionMetrics,
    type DepartmentMember,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import { packEnclose, packSiblings } from 'd3-hierarchy';

export const MAP_SIZE = 720;
export const MIN_CIRCLE_RADIUS = 14;
// Above this many people in view the dots are hidden, as SVG gets slow; canvas rendering is a follow-up
export const SVG_DOT_LIMIT = 20000;

// Gap between neighbouring circles and inside a parent's edge, in pack units
const CIRCLE_PADDING = 8;
// A small parent keeps proportionally smaller gaps, so its sub-departments keep their room
const MAX_PADDING_SHARE = 0.08;
// An enlarged circle stays this far from its parent's edge and its neighbours
const ENLARGED_CLEARANCE = 2;
// A circle that could grow by no more than this is left at its true size
const MIN_ENLARGEMENT = 0.5;
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
    // What the people are counted against: null without a headcount; for the people directly in a department,
    // the headcount it keeps for them beside its sub-departments
    headcount: number | null;
};

export type PackDatum = {
    id: string;
    // 'own' is a department without sub-departments opened on its own; 'direct' is the people directly in a
    // department beside its sub-departments
    kind: 'root' | 'department' | 'own' | 'direct';
    departmentUuid: string | null;
    name: string;
    hasHeadcount: boolean;
    hasMembers: boolean;
    childDepartmentCount: number;
    // What the area stands for: the effective headcount, or for the people directly in a department, the residual
    size: number;
    people: PeopleBucket | null;
    children: PackDatum[];
};

export type PackedCircle = Omit<PackDatum, 'children'> & {
    depth: number;
    // The circle this one is drawn inside, or null at the top of the view
    parentId: string | null;
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

// Never below the people on Lightdash, which it is for a department without a headcount
export const getDepartmentSize = (department: DepartmentWithMetrics): number =>
    department.effectiveHeadcount;

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

    // The people directly in a department beside its sub-departments, over the headcount the department keeps
    // for them, so its circles together hold its whole effective headcount
    const directBucket = (
        department: DepartmentWithMetrics,
        childData: PackDatum[],
    ): PackDatum | null => {
        const residual = getResidualHeadcount(
            department.effectiveHeadcount,
            childData.reduce((sum, child) => sum + child.size, 0),
            department.directMetrics.memberCount,
        );
        if (residual <= 0) return null;
        return {
            id: `own:${department.departmentUuid}`,
            kind: 'direct',
            departmentUuid: department.departmentUuid,
            name: `Directly in ${department.name}`,
            hasHeadcount: department.hasHeadcount,
            hasMembers: department.directMetrics.memberCount > 0,
            childDepartmentCount: 0,
            size: residual,
            people: { metrics: department.directMetrics, headcount: residual },
            children: [],
        };
    };

    // A department without sub-departments opened on its own: one circle of all its people
    const loneBucket = (
        department: DepartmentWithMetrics,
    ): PackDatum | null => {
        const size = getDepartmentSize(department);
        if (size <= 0) return null;
        return {
            id: `own:${department.departmentUuid}`,
            kind: 'own',
            departmentUuid: department.departmentUuid,
            name: `Directly in ${department.name}`,
            hasHeadcount: department.hasHeadcount,
            hasMembers: department.metrics.memberCount > 0,
            childDepartmentCount: 0,
            size,
            people: {
                metrics: department.metrics,
                headcount: department.hasHeadcount ? size : null,
            },
            children: [],
        };
    };

    const finishDatum = (
        department: DepartmentWithMetrics,
        childDepartmentCount: number,
        childData: PackDatum[],
    ): PackDatum => {
        const base = {
            id: department.departmentUuid,
            kind: 'department' as const,
            departmentUuid: department.departmentUuid,
            name: department.name,
            hasHeadcount: department.hasHeadcount,
            hasMembers: department.metrics.memberCount > 0,
            childDepartmentCount,
            size: getDepartmentSize(department),
        };
        if (childDepartmentCount === 0) {
            return {
                ...base,
                people: {
                    metrics: department.metrics,
                    headcount: department.hasHeadcount
                        ? department.effectiveHeadcount
                        : null,
                },
                children: [],
            };
        }
        const direct = directBucket(department, childData);
        return {
            ...base,
            people: null,
            children: [...childData, ...(direct ? [direct] : [])],
        };
    };

    type Frame = {
        department: DepartmentWithMetrics;
        childDepartments: DepartmentWithMetrics[];
        next: number;
        childData: PackDatum[];
    };

    // Depth first over an explicit stack, so a very deep tree cannot overflow the call stack.
    // A department already on the path (a stored cycle) is left out of its descendants
    const toDatum = (top: DepartmentWithMetrics): PackDatum => {
        const path = new Set<string>();
        const open = (department: DepartmentWithMetrics): Frame => {
            path.add(department.departmentUuid);
            return {
                department,
                childDepartments: lookup(
                    children.get(department.departmentUuid),
                ).filter((child) => !path.has(child.departmentUuid)),
                next: 0,
                childData: [],
            };
        };
        const root = open(top);
        const stack: Frame[] = [root];
        while (stack.length > 1 || root.next < root.childDepartments.length) {
            const frame = stack[stack.length - 1];
            if (frame.next < frame.childDepartments.length) {
                const child = frame.childDepartments[frame.next];
                frame.next += 1;
                stack.push(open(child));
            } else {
                // Never the root here: the loop stops once only a finished root is left
                stack.pop();
                path.delete(frame.department.departmentUuid);
                stack[stack.length - 1].childData.push(
                    finishDatum(
                        frame.department,
                        frame.childDepartments.length,
                        frame.childData,
                    ),
                );
            }
        }
        return finishDatum(
            root.department,
            root.childDepartments.length,
            root.childData,
        );
    };

    const focus = focusUuid === null ? null : (byUuid.get(focusUuid) ?? null);
    const topLevel = lookup(children.get(focus?.departmentUuid ?? null));
    const topLevelData = topLevel.map((department) => toDatum(department));
    const focusOwn =
        focus === null
            ? null
            : topLevel.length === 0
              ? loneBucket(focus)
              : directBucket(focus, topLevelData);
    const rootChildren = [...topLevelData, ...(focusOwn ? [focusOwn] : [])];
    return {
        id: 'root',
        kind: 'root',
        departmentUuid: focus?.departmentUuid ?? null,
        name: focus?.name ?? 'All departments',
        hasHeadcount: true,
        hasMembers: true,
        childDepartmentCount: topLevel.length,
        size: rootChildren.reduce((sum, child) => sum + child.size, 0),
        people: null,
        children: rootChildren,
    };
};

// Radius in pack units before scaling; every circle gets some area, so an empty one stays visible
const unitRadius = (datum: PackDatum): number =>
    Math.sqrt(Math.max(datum.size, 1));

type Packed = { x: number; y: number; r: number };

// Arranges circles of these radii around the origin, `gap` apart, then scales the arrangement
// to sit inside a circle of radius `radius`, `gap` in from its edge
const packInside = (
    radii: number[],
    centre: { x: number; y: number },
    radius: number,
    gap: number,
): Packed[] => {
    const arrange = (padding: number) => {
        const circles = packSiblings(radii.map((r) => ({ r: r + padding })));
        return { circles, enclosing: packEnclose(circles) };
    };
    // A first pass finds the scale, so the padding can be set in drawn units for the second
    const rough = arrange(0);
    const roughScale = (radius - gap) / rough.enclosing.r;
    const padding = gap / 2 / roughScale;
    const { circles, enclosing } = arrange(padding);
    const scale = (radius - gap / 2) / enclosing.r;
    return circles.map((circle, index) => ({
        x: centre.x + (circle.x - enclosing.x) * scale,
        y: centre.y + (circle.y - enclosing.y) * scale,
        r: radii[index] * scale,
    }));
};

// Largest first, then by name: the densest packing, and the same whatever order siblings arrive in
const byPackingOrder = (a: PackDatum, b: PackDatum): number =>
    b.size - a.size || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

// Siblings are packed from their own sizes and scaled to fit inside their parent, so areas compare
// exactly within a parent. Breadth first over an explicit queue, so deep trees cannot overflow.
export const layoutPack = (
    input: PackDatum,
    size: number = MAP_SIZE,
): PackedCircle[] => {
    if (input.children.length === 0) return [];
    type Pending = { datum: PackDatum; circle: PackedCircle | null };
    const placed: PackedCircle[] = [];
    const queue: Pending[] = [{ datum: input, circle: null }];
    for (let index = 0; index < queue.length; index += 1) {
        const { datum, circle } = queue[index];
        if (datum.children.length > 0) {
            const centre = circle ?? { x: size / 2, y: size / 2 };
            const radius = circle?.r ?? size / 2;
            const gap =
                circle === null
                    ? CIRCLE_PADDING
                    : Math.min(CIRCLE_PADDING, radius * MAX_PADDING_SHARE);
            const order = datum.children
                .map((_, childIndex) => childIndex)
                .sort((a, b) =>
                    byPackingOrder(datum.children[a], datum.children[b]),
                );
            const packedInOrder = packInside(
                order.map((childIndex) =>
                    unitRadius(datum.children[childIndex]),
                ),
                centre,
                radius,
                gap,
            );
            // Back to the order the siblings arrived in, which is the order they are listed in
            const children: Packed[] = [];
            order.forEach((childIndex, packedIndex) => {
                children[childIndex] = packedInOrder[packedIndex];
            });
            datum.children.forEach((child, childIndex) => {
                const packed: PackedCircle = {
                    id: child.id,
                    kind: child.kind,
                    departmentUuid: child.departmentUuid,
                    name: child.name,
                    hasHeadcount: child.hasHeadcount,
                    hasMembers: child.hasMembers,
                    childDepartmentCount: child.childDepartmentCount,
                    size: child.size,
                    people: child.people,
                    depth: (circle?.depth ?? 0) + 1,
                    parentId: circle?.id ?? null,
                    ...children[childIndex],
                    isAreaHonest: true,
                };
                placed.push(packed);
                queue.push({ datum: child, circle: packed });
            });
        }
    }
    return placed;
};

// A circle below the minimum radius grows in place, its sub-departments with it, as far as its parent's
// edge (or the drawing's), its neighbours and every sibling with more people allow; it is not to scale
export const enlargeSmallCircles = (
    circles: PackedCircle[],
    minRadius: number,
    area: { width: number; height: number },
): PackedCircle[] => {
    // Each circle as drawn so far: a grown parent's contents and grown neighbours count as they now are
    const current = new Map(circles.map((circle) => [circle.id, circle]));
    const childIds = new Map<string | null, string[]>();
    circles.forEach((circle) => {
        const group = childIds.get(circle.parentId);
        if (group) group.push(circle.id);
        else childIds.set(circle.parentId, [circle.id]);
    });
    // Everything drawn inside a circle, walked with a queue so a deep tree cannot overflow
    const getDescendants = (id: string): PackedCircle[] => {
        const seen = new Set<string>([id]);
        const queue = [...(childIds.get(id) ?? [])];
        const found: PackedCircle[] = [];
        for (let index = 0; index < queue.length; index += 1) {
            const descendantId = queue[index];
            const descendant = current.get(descendantId);
            if (!seen.has(descendantId) && descendant) {
                seen.add(descendantId);
                found.push(descendant);
                queue.push(...(childIds.get(descendantId) ?? []));
            }
        }
        return found;
    };
    const getSiblings = (circle: PackedCircle): PackedCircle[] =>
        (childIds.get(circle.parentId) ?? []).flatMap((id) => {
            const sibling = current.get(id);
            return sibling && id !== circle.id ? [sibling] : [];
        });
    [...circles]
        .sort(
            (a, b) =>
                a.depth - b.depth ||
                b.size - a.size ||
                a.name.localeCompare(b.name) ||
                a.id.localeCompare(b.id),
        )
        .forEach(({ id }) => {
            const circle = current.get(id);
            if (!circle || circle.r >= minRadius) return;
            const parent =
                circle.parentId === null
                    ? undefined
                    : current.get(circle.parentId);
            const roomInside =
                parent === undefined
                    ? Math.min(
                          circle.x,
                          area.width - circle.x,
                          circle.y,
                          area.height - circle.y,
                      )
                    : parent.r -
                      Math.hypot(circle.x - parent.x, circle.y - parent.y);
            const siblings = getSiblings(circle);
            const roomBeside = siblings.reduce(
                (room, other) =>
                    Math.min(
                        room,
                        Math.hypot(circle.x - other.x, circle.y - other.y) -
                            other.r,
                    ),
                Number.POSITIVE_INFINITY,
            );
            // Parents settle before their children and larger siblings first, so these are final
            const largestAllowed = siblings
                .filter((other) => other.size > circle.size)
                .reduce(
                    (smallest, other) => Math.min(smallest, other.r),
                    Number.POSITIVE_INFINITY,
                );
            const r = Math.min(
                minRadius,
                roomInside - ENLARGED_CLEARANCE,
                roomBeside - ENLARGED_CLEARANCE,
                largestAllowed,
            );
            if (r - circle.r <= MIN_ENLARGEMENT) return;
            const scale = r / circle.r;
            getDescendants(circle.id).forEach((descendant) =>
                current.set(descendant.id, {
                    ...descendant,
                    x: circle.x + (descendant.x - circle.x) * scale,
                    y: circle.y + (descendant.y - circle.y) * scale,
                    r: descendant.r * scale,
                }),
            );
            current.set(circle.id, { ...circle, r, isAreaHonest: false });
        });
    return circles.map((circle) => current.get(circle.id) ?? circle);
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
