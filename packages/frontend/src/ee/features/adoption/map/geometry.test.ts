import {
    OrganizationMemberRole,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { dept, memberFixture, metricsFixture } from '../utils/adoptionFixtures';
import {
    buildPackInput,
    countPeople,
    enlargeSmallCircles,
    expandDots,
    getDotRadius,
    getDotSegments,
    getSunflowerSpacing,
    getMemberDotKind,
    layoutDots,
    layoutPack,
    MIN_CIRCLE_RADIUS,
    orderMembersForDots,
    shouldRenderDots,
    sunflowerPositions,
    SVG_DOT_LIMIT,
    truncateLabel,
    type PackedCircle,
} from './geometry';

const NOW = new Date('2026-10-07T12:00:00Z');

const d = (
    name: string,
    parent: string | null,
    headcount: number | null,
    rolledMembers: number,
    directMembers: number = rolledMembers,
    active: number = 0,
): DepartmentWithMetrics =>
    dept(name, parent, null, {
        headcount,
        effectiveHeadcount: headcount,
        metrics: metricsFixture(rolledMembers, null, {
            activeCount30d: active,
            activeCount12w: active,
        }),
        directMetrics: metricsFixture(directMembers, null, {
            activeCount30d: Math.min(active, directMembers),
            activeCount12w: Math.min(active, directMembers),
        }),
    });

// Ops (100) ─┬─ Stores (40)
//            └─ Depots (20)      Finance (no headcount, 5 people)      Legal (2, nobody)
const tree = [
    d('Ops', null, 100, 9, 3),
    d('Stores', 'Ops', 40, 4, 4, 3),
    d('Depots', 'Ops', 20, 2),
    d('Finance', null, null, 5),
    d('Legal', null, 2, 0),
];

describe('getDotSegments', () => {
    const bucket = (
        headcount: number | null,
        members: number,
        active: number,
    ) => ({
        headcount,
        metrics: metricsFixture(members, null, {
            activeCount30d: active,
            activeCount12w: active + 1,
            roleSplit: {
                viewers: members - 3,
                interactiveViewers: 1,
                editors: 1,
                admins: 1,
            },
        }),
    });

    it('splits into active, idle and no account for the default colouring', () => {
        expect(getDotSegments(bucket(10, 6, 4), 'active')).toEqual([
            { kind: 'active', count: 4 },
            { kind: 'idle', count: 2 },
            { kind: 'noAccount', count: 4 },
        ]);
    });
    it('draws no grey dots when accounts outnumber a stale headcount', () => {
        const segments = getDotSegments(bucket(10, 12, 4), 'active');
        expect(segments.find((s) => s.kind === 'noAccount')?.count).toBe(0);
        expect(expandDots(segments)).toHaveLength(12);
    });
    it('draws no grey dots without a headcount', () => {
        const segments = getDotSegments(bucket(null, 6, 4), 'active');
        expect(segments.find((s) => s.kind === 'noAccount')?.count).toBe(0);
    });
    it('splits by role', () => {
        expect(getDotSegments(bucket(10, 6, 4), 'role')).toEqual([
            { kind: 'admin', count: 1 },
            { kind: 'editor', count: 1 },
            { kind: 'interactiveViewer', count: 1 },
            { kind: 'viewer', count: 3 },
            { kind: 'noAccount', count: 4 },
        ]);
    });
    it('splits by last active using the 30-day and 12-week counts', () => {
        expect(getDotSegments(bucket(10, 6, 4), 'lastActive')).toEqual([
            { kind: 'active', count: 4 },
            { kind: 'lapsed', count: 1 },
            { kind: 'inactive', count: 1 },
            { kind: 'noAccount', count: 4 },
        ]);
    });
});

describe('expandDots', () => {
    it('keeps segment order so active people form the core', () => {
        expect(
            expandDots([
                { kind: 'active', count: 2 },
                { kind: 'idle', count: 1 },
                { kind: 'noAccount', count: 0 },
            ]),
        ).toEqual(['active', 'active', 'idle']);
    });
});

describe('sunflowerPositions', () => {
    it('returns one position per person, all inside the radius', () => {
        const positions = sunflowerPositions(200, 50);
        expect(positions).toHaveLength(200);
        positions.forEach((p) =>
            expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(50),
        );
    });
    it('puts the first dots nearest the centre', () => {
        const distances = sunflowerPositions(50, 30).map((p) =>
            Math.hypot(p.x, p.y),
        );
        expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    });
    it('is deterministic and empty for nobody', () => {
        expect(sunflowerPositions(7, 10)).toEqual(sunflowerPositions(7, 10));
        expect(sunflowerPositions(0, 10)).toEqual([]);
    });
});

describe('getDotRadius', () => {
    it('shrinks as a circle gets more crowded and stays within bounds', () => {
        expect(getDotRadius(10, 100)).toBeGreaterThan(getDotRadius(1000, 100));
        expect(getDotRadius(1, 400)).toBeLessThanOrEqual(11);
        expect(getDotRadius(150, 400)).toBeLessThanOrEqual(5);
        expect(getDotRadius(100000, 10)).toBeGreaterThanOrEqual(0.75);
        expect(getDotRadius(0, 10)).toBe(0);
    });
});

describe('buildPackInput', () => {
    it('nests sub-departments and gives a parent a bucket for its own people', () => {
        const root = buildPackInput(tree, null);
        expect(root.children.map((c) => c.id)).toEqual([
            'Ops',
            'Finance',
            'Legal',
        ]);
        const ops = root.children[0];
        expect(ops.people).toBeNull();
        expect(ops.children.map((c) => c.id)).toEqual([
            'Stores',
            'Depots',
            'own:Ops',
        ]);
        // 100 in Ops minus 60 in its sub-departments
        expect(ops.children[2].people?.headcount).toBe(40);
        expect(ops.children[2].people?.metrics.memberCount).toBe(3);
    });
    it('marks departments without headcount or without members', () => {
        const root = buildPackInput(tree, null);
        const byId = new Map(root.children.map((c) => [c.id, c]));
        expect(byId.get('Finance')).toMatchObject({
            hasHeadcount: false,
            hasMembers: true,
        });
        expect(byId.get('Legal')).toMatchObject({
            hasHeadcount: true,
            hasMembers: false,
        });
    });
    it('makes the children of the focused department the top level', () => {
        const root = buildPackInput(tree, 'Ops');
        expect(root.name).toBe('Ops');
        expect(root.children.map((c) => c.id)).toEqual([
            'Stores',
            'Depots',
            'own:Ops',
        ]);
    });
    it('shows a single bucket of everyone when the focused department has no children', () => {
        const root = buildPackInput(tree, 'Stores');
        expect(root.children.map((c) => c.id)).toEqual(['own:Stores']);
        expect(root.children[0].people?.headcount).toBe(40);
    });
    it('falls back to the whole organization for an unknown focus', () => {
        expect(buildPackInput(tree, 'gone').children).toHaveLength(3);
    });
    it('builds a 5,000-deep chain and a 5,000-wide level without overflowing the stack', () => {
        const SIZE = 5000;
        const chain = Array.from({ length: SIZE }, (_, i) =>
            d(`d${i}`, i === 0 ? null : `d${i - 1}`, 1, 1, 0),
        );
        let datum = buildPackInput(chain, null).children[0];
        let depth = 1;
        while (datum.children.length > 0) {
            [datum] = datum.children;
            depth += 1;
        }
        expect(depth).toBe(SIZE);
        expect(datum.id).toBe(`d${SIZE - 1}`);

        const wide = [
            d('Root', null, SIZE, SIZE, 0),
            ...Array.from({ length: SIZE }, (_, i) => d(`c${i}`, 'Root', 1, 1)),
        ];
        const root = buildPackInput(wide, null).children[0];
        expect(root.childDepartmentCount).toBe(SIZE);
        expect(root.children.map((c) => c.id)).toEqual(
            wide.slice(1).map((c) => c.departmentUuid),
        );
    });
});

describe('layoutPack', () => {
    it('keeps every circle on the canvas and sub-departments inside their parent', () => {
        const circles = layoutPack(buildPackInput(tree, null), 720);
        const byId = new Map(circles.map((c) => [c.id, c]));
        circles
            .filter((c) => c.isAreaHonest)
            .forEach((c) => {
                expect(c.x - c.r).toBeGreaterThanOrEqual(-0.001);
                expect(c.x + c.r).toBeLessThanOrEqual(720.001);
            });
        const ops = byId.get('Ops');
        const stores = byId.get('Stores');
        expect(ops && stores).toBeTruthy();
        if (ops && stores) {
            expect(
                Math.hypot(stores.x - ops.x, stores.y - ops.y) + stores.r,
            ).toBeLessThanOrEqual(ops.r + 0.001);
            expect(stores.depth).toBe(ops.depth + 1);
        }
    });
    it('sizes circles by headcount', () => {
        const circles = layoutPack(buildPackInput(tree, 'Ops'), 720);
        const byId = new Map(circles.map((c) => [c.id, c]));
        expect(byId.get('Stores')?.r ?? 0).toBeGreaterThan(
            byId.get('Depots')?.r ?? 0,
        );
    });
    it('packs every circle at its true size, leaving the minimum radius to the drawing', () => {
        const circles = layoutPack(
            buildPackInput(
                [d('Huge', null, 5000, 10), d('Tiny', null, 1, 1)],
                null,
            ),
            720,
        );
        const byId = new Map(circles.map((c) => [c.id, c]));
        circles.forEach((c) => expect(c.isAreaHonest).toBe(true));
        expect(
            ((byId.get('Tiny')?.r ?? 0) / (byId.get('Huge')?.r ?? 1)) ** 2,
        ).toBeCloseTo(1 / 5000, 9);
    });
    it('records the circle each circle sits in', () => {
        const circles = layoutPack(buildPackInput(tree, null), 720);
        const parents = new Map(circles.map((c) => [c.id, c.parentId]));
        expect(parents.get('Ops')).toBeNull();
        expect(parents.get('Stores')).toBe('Ops');
        expect(parents.get('own:Ops')).toBe('Ops');
        expect(parents.get('Finance')).toBeNull();
    });
    it('returns nothing when there is nothing to draw', () => {
        expect(layoutPack(buildPackInput([], null))).toEqual([]);
    });
});

describe('dot budget', () => {
    it('counts headcount, or members when they outnumber it', () => {
        const circles = layoutPack(buildPackInput(tree, null));
        // Stores 40 + Depots 20 + Ops own 40 + Finance 5 + Legal 2
        expect(countPeople(circles)).toBe(107);
    });
    it('renders dots in SVG up to the limit and not beyond', () => {
        expect(shouldRenderDots(SVG_DOT_LIMIT)).toBe(true);
        expect(shouldRenderDots(SVG_DOT_LIMIT + 1)).toBe(false);
    });
});

describe('member dots', () => {
    const recent = memberFixture('recent', '2026-10-01T00:00:00Z', {
        role: OrganizationMemberRole.ADMIN,
        isActive30d: true,
    });
    const lapsed = memberFixture('lapsed', '2026-08-15T00:00:00Z', {
        role: OrganizationMemberRole.DEVELOPER,
    });
    const never = memberFixture('never', null, {
        role: OrganizationMemberRole.MEMBER,
    });

    it('colours by activity', () => {
        expect(getMemberDotKind(recent, 'active', NOW)).toBe('active');
        expect(getMemberDotKind(lapsed, 'active', NOW)).toBe('idle');
        expect(getMemberDotKind(never, 'active', NOW)).toBe('idle');
    });
    it('takes active in 30 days from the server flag, not from the timestamp', () => {
        const flaggedIdle = memberFixture('x', NOW.toISOString());
        const flaggedActive = memberFixture('y', '2020-01-01T00:00:00Z', {
            isActive30d: true,
        });
        expect(getMemberDotKind(flaggedIdle, 'active', NOW)).toBe('idle');
        expect(getMemberDotKind(flaggedIdle, 'lastActive', NOW)).toBe('lapsed');
        expect(getMemberDotKind(flaggedActive, 'active', NOW)).toBe('active');
        expect(getMemberDotKind(flaggedActive, 'lastActive', NOW)).toBe(
            'active',
        );
    });
    it('colours by role with the same buckets as the role split', () => {
        expect(getMemberDotKind(recent, 'role', NOW)).toBe('admin');
        expect(getMemberDotKind(lapsed, 'role', NOW)).toBe('editor');
        expect(getMemberDotKind(never, 'role', NOW)).toBe('viewer');
    });
    it('colours by last active', () => {
        expect(getMemberDotKind(recent, 'lastActive', NOW)).toBe('active');
        expect(getMemberDotKind(lapsed, 'lastActive', NOW)).toBe('lapsed');
        expect(getMemberDotKind(never, 'lastActive', NOW)).toBe('inactive');
    });
    it('orders active people first so they form the core', () => {
        expect(
            orderMembersForDots([never, lapsed, recent], 'lastActive', NOW).map(
                (m) => m.userUuid,
            ),
        ).toEqual(['recent', 'lapsed', 'never']);
    });
});

describe('truncateLabel', () => {
    it('keeps short names and shortens long ones to fit the circle', () => {
        expect(truncateLabel('Ops', 60)).toBe('Ops');
        expect(truncateLabel('Customer operations and support', 35)).toBe(
            'Customer…',
        );
    });
});

describe('edge cases', () => {
    const segmentCount = (
        headcount: number | null,
        members: number,
        kind: string,
    ) =>
        getDotSegments(
            {
                headcount,
                metrics: metricsFixture(members, null, { activeCount30d: 1 }),
            },
            'active',
        ).find((s) => s.kind === kind)?.count;

    it('never counts a negative no-account segment for a stale headcount', () => {
        expect(segmentCount(3, 10, 'noAccount')).toBe(0);
        expect(segmentCount(0, 10, 'noAccount')).toBe(0);
    });

    it('draws a stale-headcount department with every account and no grey dots', () => {
        const circles = layoutPack(
            buildPackInput([d('Stale', null, 3, 10, 10, 4)], null),
        );
        expect(circles).toHaveLength(1);
        expect(countPeople(circles)).toBe(10);
        expect(circles[0].r).toBeGreaterThan(0);
    });

    it('sizes a department with no headcount by its members and flags it', () => {
        const [finance] = layoutPack(
            buildPackInput([d('Finance', null, null, 6)], null),
        );
        expect(finance.hasHeadcount).toBe(false);
        expect(countPeople([finance])).toBe(6);
        expect(finance.r).toBeGreaterThan(0);
    });

    it('draws headcount 0 with members and no members at all', () => {
        const circles = layoutPack(
            buildPackInput(
                [d('Zero', null, 0, 4), d('Nobody', null, 5, 0)],
                null,
            ),
        );
        const byId = new Map(circles.map((c) => [c.id, c]));
        expect(byId.get('Zero')?.hasHeadcount).toBe(true);
        expect(byId.get('Zero')?.hasMembers).toBe(true);
        expect(countPeople([byId.get('Zero')!])).toBe(4);
        expect(byId.get('Nobody')?.hasMembers).toBe(false);
        expect(byId.get('Nobody')?.r).toBeGreaterThan(0);
    });

    it('draws a department with neither headcount nor members', () => {
        const [empty] = layoutPack(
            buildPackInput([d('Empty', null, null, 0)], null),
        );
        expect(empty.hasMembers).toBe(false);
        expect(empty.r).toBeGreaterThanOrEqual(MIN_CIRCLE_RADIUS);
        expect(countPeople([empty])).toBe(0);
    });

    it('keeps a parent below its children without a negative own bucket', () => {
        const root = buildPackInput(
            [
                d('Parent', null, 10, 14, 2),
                d('A', 'Parent', 20, 6),
                d('B', 'Parent', 20, 6),
            ],
            null,
        );
        const parent = root.children[0];
        const own = parent.children.find((c) => c.kind === 'own');
        expect(own?.people?.headcount).toBe(2);
        const circles = layoutPack(root);
        // children's 40 plus the two people directly in Parent
        expect(countPeople(circles)).toBe(42);
        circles.forEach((c) => expect(Number.isFinite(c.r)).toBe(true));
    });

    it('survives a cycle in the data without recursing forever', () => {
        const circles = layoutPack(
            buildPackInput(
                [d('A', 'B', 5, 1), d('B', 'A', 5, 1), d('C', null, 5, 1)],
                null,
            ),
        );
        expect(circles.map((c) => c.id)).toContain('C');
    });
});

describe('large department', () => {
    const big = layoutPack(
        buildPackInput([d('Big', null, 3000, 2400, 2400, 1500)], null),
        720,
    );
    const [circle] = big;

    it('counts every person once', () => {
        expect(countPeople(big)).toBe(3000);
        const segments = circle.people
            ? getDotSegments(circle.people, 'active')
            : [];
        expect(expandDots(segments)).toHaveLength(3000);
        expect(segments.map((s) => s.count)).toEqual([1500, 900, 600]);
    });

    it('keeps every dot inside its circle with a margin, active first', () => {
        const { dotRadius, positions } = layoutDots(3000, circle.r);
        expect(positions).toHaveLength(3000);
        positions.forEach((p) =>
            expect(Math.hypot(p.x, p.y) + dotRadius).toBeLessThan(circle.r),
        );
        expect(dotRadius).toBeGreaterThan(0);
    });

    it('is deterministic', () => {
        expect(layoutDots(3000, 120)).toEqual(layoutDots(3000, 120));
    });

    it('stays inside even for a tiny circle with many people', () => {
        const { dotRadius, positions } = layoutDots(3000, MIN_CIRCLE_RADIUS);
        positions.forEach((p) =>
            expect(Math.hypot(p.x, p.y) + dotRadius).toBeLessThan(
                MIN_CIRCLE_RADIUS,
            ),
        );
    });

    it('handles nobody', () => {
        expect(layoutDots(0, 20)).toEqual({ dotRadius: 0, positions: [] });
    });
});

// Shaped like a large organization: the biggest departments hold few sub-departments, smaller ones many
const organization = [
    d('Operations', null, 2350, 221, 2),
    d('Supply chain', 'Operations', 1750, 170, 0),
    d('Warehousing', 'Supply chain', 900, 12),
    d('Logistics', 'Supply chain', 600, 48),
    d('Demand planning', 'Supply chain', 120, 75),
    d('Procurement operations', 'Supply chain', 80, 35),
    d('Facilities', 'Operations', 120, 12),
    d('Health and safety', 'Operations', 45, 8),
    d('Quality', 'Operations', 90, 29),
    d('Commercial', null, 1900, 834, 3),
    d('Customer success', 'Commercial', 700, 312, 1),
    d('Support', 'Customer success', 400, 141, 6),
    d('Tier 1', 'Support', 250, 70),
    d('Tier 2', 'Support', 110, 50),
    d('Support leads', 'Support', 20, 15),
    d('Account managers', 'Customer success', 150, 108),
    d('Onboarding', 'Customer success', 60, 29),
    d('Renewals', 'Customer success', 45, 33),
    d('Sales', 'Commercial', 760, 420, 14),
    d('Enterprise sales', 'Sales', 220, 155),
    d('Mid-market sales', 'Sales', 300, 168),
    d('Sales development', 'Sales', 180, 53),
    d('Sales operations', 'Sales', 40, 30),
    d('Marketing', 'Commercial', 180, 99, 2),
    d('Brand', 'Marketing', 40, 24),
    d('Growth', 'Marketing', 70, 49),
    d('Marketing operations', 'Marketing', 25, 10),
    d('Product marketing', 'Marketing', null, 14),
    d('Finance', null, 420, 187, 24),
    d('Controllership', 'Finance', 120, 49),
    d('Planning', 'Finance', 60, 48),
    d('Audit', 'Finance', 25, 9),
    d('Procurement', 'Finance', 90, 25),
    d('Tax', 'Finance', 40, 12),
    d('Treasury', 'Finance', 35, 20),
    d('Data', null, 70, 67, 5),
    d('Analytics engineering', 'Data', 18, 18),
    d('Business intelligence', 'Data', 22, 21),
    d('Data governance', 'Data', 8, 9),
    d('Data science', 'Data', 15, 14),
    d('Legal', null, 60, 0),
    d('Executive office', null, 12, 8),
];

const distance = (a: PackedCircle, b: PackedCircle): number =>
    Math.hypot(a.x - b.x, a.y - b.y);

describe('sizing by headcount', () => {
    const TOP: [string, number][] = [
        ['Operations', 2350],
        ['Commercial', 1900],
        ['Finance', 420],
        ['Data', 70],
        ['Legal', 60],
        ['Executive office', 12],
    ];
    const circles = layoutPack(buildPackInput(organization, null));
    const byId = new Map(circles.map((c) => [c.id, c]));
    const radius = (id: string): number => {
        const circle = byId.get(id);
        if (!circle) throw new Error(`No circle ${id}`);
        return circle.r;
    };
    // Each area as a share of the first one's, against the same share of headcount
    const expectAreasInProportion = (entries: [string, number][]) => {
        const [firstId, firstHeadcount] = entries[0];
        entries.forEach(([id, headcount]) => {
            const areaShare = (radius(id) / radius(firstId)) ** 2;
            const ratio = areaShare / (headcount / firstHeadcount);
            expect(ratio).toBeGreaterThan(0.95);
            expect(ratio).toBeLessThan(1.05);
        });
    };

    it('orders the top-level circles by headcount, not by how many sub-departments they hold', () => {
        const radii = TOP.map(([id]) => radius(id));
        radii.slice(1).forEach((r, index) => {
            expect(r).toBeLessThan(radii[index]);
        });
    });
    it('gives every top-level department an area within 5% of its share of headcount', () => {
        expectAreasInProportion(TOP);
    });
    it('sizes sub-departments against their siblings the same way at every level', () => {
        expectAreasInProportion([
            ['Sales', 760],
            ['Customer success', 700],
            ['Marketing', 180],
        ]);
        expectAreasInProportion([
            ['Warehousing', 900],
            ['Logistics', 600],
            ['Demand planning', 120],
            ['Procurement operations', 80],
        ]);
        expectAreasInProportion([
            ['Tier 1', 250],
            ['Tier 2', 110],
            ['Support leads', 20],
        ]);
    });
    it('sizes a department without a headcount by its people on Lightdash', () => {
        expectAreasInProportion([
            ['Brand', 40],
            ['Product marketing', 14],
        ]);
    });
    it('keeps every sub-department inside its parent and apart from its siblings', () => {
        circles.forEach((circle) => {
            const parent =
                circle.parentId === null ? null : byId.get(circle.parentId);
            if (parent) {
                expect(distance(circle, parent) + circle.r).toBeLessThanOrEqual(
                    parent.r + 1e-6,
                );
            }
            circles
                .filter(
                    (other) =>
                        other.id !== circle.id &&
                        other.parentId === circle.parentId,
                )
                .forEach((other) => {
                    expect(distance(circle, other)).toBeGreaterThanOrEqual(
                        circle.r + other.r - 1e-6,
                    );
                });
        });
    });
});

describe('packing order', () => {
    const shapeOf = (departments: DepartmentWithMetrics[]) =>
        new Map(
            layoutPack(buildPackInput(departments, null)).map((circle) => [
                circle.id,
                { x: circle.x, y: circle.y, r: circle.r },
            ]),
        );
    // Every sibling list reversed, and rotated by three, against the order the departments came in
    const reversed = [...organization].reverse();
    const rotated = [...organization.slice(3), ...organization.slice(0, 3)];

    it('draws the same circles whatever order the departments arrive in', () => {
        const expected = shapeOf(organization);
        [reversed, rotated].forEach((order) => {
            const actual = shapeOf(order);
            expect(actual.size).toBe(expected.size);
            expected.forEach((circle, id) => {
                expect(actual.get(id)?.r).toBeCloseTo(circle.r, 9);
                expect(actual.get(id)?.x).toBeCloseTo(circle.x, 9);
                expect(actual.get(id)?.y).toBeCloseTo(circle.y, 9);
            });
        });
    });
    it('keeps the order of siblings with the same headcount by name', () => {
        const twins = [
            d('Group', null, 30, 0, 0),
            d('Beta', 'Group', 10, 0),
            d('Alpha', 'Group', 10, 0),
            d('Gamma', 'Group', 10, 0),
        ];
        const first = shapeOf(twins);
        const second = shapeOf([...twins].reverse());
        ['Alpha', 'Beta', 'Gamma'].forEach((id) => {
            expect(second.get(id)?.x).toBeCloseTo(first.get(id)?.x ?? 0, 9);
            expect(second.get(id)?.y).toBeCloseTo(first.get(id)?.y ?? 0, 9);
        });
    });
    it('packs the largest sub-departments first, so they fill more of their parent', () => {
        // Smallest first, the order that packs worst
        const circles = layoutPack(buildPackInput(reversed, null));
        const byId = new Map(circles.map((circle) => [circle.id, circle]));
        const share = (child: string, parent: string) =>
            ((byId.get(child)?.r ?? 0) / (byId.get(parent)?.r ?? 1)) ** 2;
        // Supply chain holds 1,750 of Operations' 2,350; packed in arrival order it got about a quarter
        expect(share('Supply chain', 'Operations')).toBeGreaterThan(0.38);
        expect(share('Sales', 'Commercial')).toBeGreaterThan(0.22);
    });
});

describe('enlargeSmallCircles', () => {
    const AREA = { width: 720, height: 720 };
    // Group and Big hold the same number of people; Tiny is too small to select
    const departments = [
        d('Big', null, 1000, 10),
        d('Group', null, 1000, 10, 0),
        d('Core', 'Group', 997, 9),
        d('Tiny', 'Group', 3, 1),
    ];
    const packed = layoutPack(buildPackInput(departments, null), 720);
    const enlarged = enlargeSmallCircles(packed, MIN_CIRCLE_RADIUS, AREA);
    const pick = (circles: PackedCircle[], id: string): PackedCircle => {
        const circle = circles.find((each) => each.id === id);
        if (!circle) throw new Error(`No circle ${id}`);
        return circle;
    };

    it('starts from a leaf drawn below the minimum radius', () => {
        expect(pick(packed, 'Tiny').r).toBeLessThan(MIN_CIRCLE_RADIUS);
    });
    it('enlarges that leaf and says it is not to scale', () => {
        const tiny = pick(enlarged, 'Tiny');
        expect(tiny.r).toBeGreaterThan(pick(packed, 'Tiny').r + 1);
        expect(tiny.r).toBeLessThanOrEqual(MIN_CIRCLE_RADIUS);
        expect(tiny.isAreaHonest).toBe(false);
    });
    it('never changes the parent, moves the leaf or re-packs its siblings', () => {
        ['Big', 'Group', 'Core'].forEach((id) => {
            expect(pick(enlarged, id)).toEqual(pick(packed, id));
        });
        expect(pick(enlarged, 'Group').r).toBeCloseTo(
            pick(enlarged, 'Big').r,
            9,
        );
        expect(pick(enlarged, 'Tiny')).toMatchObject({
            x: pick(packed, 'Tiny').x,
            y: pick(packed, 'Tiny').y,
        });
    });
    it('keeps the enlarged leaf inside its parent and clear of its sibling', () => {
        const tiny = pick(enlarged, 'Tiny');
        const group = pick(enlarged, 'Group');
        const core = pick(enlarged, 'Core');
        expect(distance(tiny, group) + tiny.r).toBeLessThanOrEqual(group.r);
        expect(distance(tiny, core)).toBeGreaterThanOrEqual(tiny.r + core.r);
    });
    it('enlarges a top-level leaf without touching its neighbour or leaving the drawing', () => {
        const pair = enlargeSmallCircles(
            layoutPack(
                buildPackInput(
                    [d('Huge', null, 5000, 10), d('Speck', null, 1, 1)],
                    null,
                ),
                720,
            ),
            MIN_CIRCLE_RADIUS,
            AREA,
        );
        const speck = pick(pair, 'Speck');
        const huge = pick(pair, 'Huge');
        expect(speck.isAreaHonest).toBe(false);
        expect(huge.isAreaHonest).toBe(true);
        expect(distance(speck, huge)).toBeGreaterThanOrEqual(speck.r + huge.r);
        expect(speck.x - speck.r).toBeGreaterThanOrEqual(0);
        expect(speck.y - speck.r).toBeGreaterThanOrEqual(0);
        expect(speck.x + speck.r).toBeLessThanOrEqual(AREA.width);
        expect(speck.y + speck.r).toBeLessThanOrEqual(AREA.height);
    });
    it('flags a leaf as not to scale only when it grows by more than half a pixel', () => {
        const at = (
            id: string,
            parentId: string | null,
            x: number,
            y: number,
            r: number,
        ): PackedCircle => ({
            id,
            kind: 'department',
            departmentUuid: id,
            name: id,
            hasHeadcount: true,
            hasMembers: true,
            childDepartmentCount: 0,
            size: 1,
            people: null,
            depth: parentId === null ? 1 : 2,
            parentId,
            x,
            y,
            r,
            isAreaHonest: true,
        });
        // Room to the parent's edge, less the clearance: none for Snug, 0.3 px for Close, 8 px for Free
        const circles = [
            at('Parent', null, 100, 100, 40),
            at('Snug', 'Parent', 100, 67, 5),
            at('Close', 'Parent', 100, 132.7, 5),
            at('Free', 'Parent', 75, 100, 5),
        ];
        const after = enlargeSmallCircles(circles, MIN_CIRCLE_RADIUS, AREA);
        expect(pick(after, 'Snug')).toEqual(pick(circles, 'Snug'));
        expect(pick(after, 'Close')).toEqual(pick(circles, 'Close'));
        expect(pick(after, 'Free').r).toBeCloseTo(13, 9);
        expect(pick(after, 'Free').isAreaHonest).toBe(false);
    });
    it('leaves circles at the minimum radius or more alone', () => {
        const roomy = layoutPack(
            buildPackInput([d('A', null, 10, 1), d('B', null, 12, 1)], null),
            720,
        );
        expect(enlargeSmallCircles(roomy, MIN_CIRCLE_RADIUS, AREA)).toEqual(
            roomy,
        );
    });
    it('enlarges a department that holds sub-departments, and scales them inside it', () => {
        const nested = layoutPack(
            buildPackInput(
                [
                    d('Huge', null, 20000, 10),
                    d('Small', null, 2, 2, 0),
                    d('Inner', 'Small', 2, 2),
                ],
                null,
            ),
            720,
        );
        const after = enlargeSmallCircles(nested, MIN_CIRCLE_RADIUS, AREA);
        const before = pick(nested, 'Small');
        const small = pick(after, 'Small');
        const inner = pick(after, 'Inner');
        expect(small.r).toBeGreaterThan(before.r + 1);
        expect(small).toMatchObject({
            x: before.x,
            y: before.y,
            isAreaHonest: false,
        });
        // About the department's centre, so its sub-department fills it as before and stays inside
        const scale = small.r / before.r;
        expect(inner.r).toBeCloseTo(pick(nested, 'Inner').r * scale, 9);
        expect(distance(inner, small) + inner.r).toBeLessThanOrEqual(
            small.r + 1e-9,
        );
        expect(distance(small, pick(after, 'Huge'))).toBeGreaterThanOrEqual(
            small.r + pick(after, 'Huge').r,
        );
    });
    it('never draws a circle smaller than a sibling with fewer people', () => {
        // A 70-person department with sub-departments beside a 12-person one without, both too small to select
        const packedSmall = layoutPack(
            buildPackInput(
                [
                    d('Huge', null, 80000, 10),
                    d('Seventy', null, 70, 67, 5),
                    d('Twenty two', 'Seventy', 22, 21),
                    d('Eighteen', 'Seventy', 18, 18),
                    d('Fifteen', 'Seventy', 15, 14),
                    d('Eight', 'Seventy', 8, 9),
                    d('Twelve', null, 12, 8),
                ],
                null,
            ),
            720,
        );
        expect(pick(packedSmall, 'Seventy').r).toBeLessThan(MIN_CIRCLE_RADIUS);
        const after = enlargeSmallCircles(packedSmall, MIN_CIRCLE_RADIUS, AREA);
        const seventy = pick(after, 'Seventy');
        expect(seventy.isAreaHonest).toBe(false);
        expect(seventy.r).toBeGreaterThanOrEqual(pick(after, 'Twelve').r);
        // Inside it too, the larger sub-departments stay at least as large as the smaller
        const inside = ['Twenty two', 'Eighteen', 'Fifteen', 'Eight'].map(
            (id) => pick(after, id).r,
        );
        inside.slice(1).forEach((r, index) => {
            expect(r).toBeLessThanOrEqual(inside[index] + 1e-9);
        });
    });
});

describe('dot size for the people in view', () => {
    const CIRCLE = 250;
    const closestPair = (positions: { x: number; y: number }[]): number =>
        positions.reduce(
            (closest, a, index) =>
                positions
                    .slice(index + 1)
                    .reduce(
                        (best, b) =>
                            Math.min(best, Math.hypot(a.x - b.x, a.y - b.y)),
                        closest,
                    ),
            Number.POSITIVE_INFINITY,
        );

    it.each([1, 9, 20])(
        'draws %i people as dots 16 to 24 pixels across',
        (count) => {
            const { dotRadius } = layoutDots(count, CIRCLE);
            expect(dotRadius * 2).toBeGreaterThanOrEqual(16);
            expect(dotRadius * 2).toBeLessThanOrEqual(24);
        },
    );
    it('shrinks smoothly from 20 people to 150 and beyond', () => {
        const radii = [20, 21, 50, 100, 150, 3000].map(
            (count) => layoutDots(count, CIRCLE).dotRadius,
        );
        radii.slice(1).forEach((radius, index) => {
            expect(radius).toBeLessThanOrEqual(radii[index]);
        });
        // One more person never changes the size by a visible step
        expect(radii[0] - radii[1]).toBeLessThan(0.1);
        expect(layoutDots(150, CIRCLE).dotRadius).toBeCloseTo(5, 6);
        expect(layoutDots(3000, CIRCLE).dotRadius).toBeCloseTo(
            (248 / Math.sqrt(3000)) * 0.6,
            6,
        );
    });
    it.each([1, 9, 20, 150, 3000])(
        'keeps %i dots apart and inside the circle',
        (count) => {
            const { dotRadius, positions } = layoutDots(count, CIRCLE);
            expect(positions).toHaveLength(count);
            positions.forEach((position) => {
                expect(
                    Math.hypot(position.x, position.y) + dotRadius,
                ).toBeLessThanOrEqual(CIRCLE);
            });
            if (count > 1) {
                expect(closestPair(positions)).toBeGreaterThanOrEqual(
                    dotRadius * 2,
                );
            }
        },
    );
    it('is the same every time', () => {
        expect(layoutDots(9, CIRCLE)).toEqual(layoutDots(9, CIRCLE));
    });
    it('still fits a single person inside the smallest circle', () => {
        const { dotRadius } = layoutDots(1, MIN_CIRCLE_RADIUS);
        expect(dotRadius).toBeLessThanOrEqual(MIN_CIRCLE_RADIUS / 2);
        expect(dotRadius).toBeGreaterThan(3);
    });
});

describe('dots never overlap', () => {
    const closest = (positions: { x: number; y: number }[]): number =>
        positions.reduce(
            (best, a, index) =>
                positions
                    .slice(index + 1)
                    .reduce(
                        (inner, b) =>
                            Math.min(inner, Math.hypot(a.x - b.x, a.y - b.y)),
                        best,
                    ),
            Number.POSITIVE_INFINITY,
        );
    const COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 12, 20, 50, 150];
    const RADII = [MIN_CIRCLE_RADIUS, 20, 30, 40, 80, 250];
    const cases = RADII.flatMap((radius) =>
        COUNTS.map((count): [number, number] => [count, radius]),
    );

    it.each(cases)(
        'keeps %i dots apart and inside a circle of radius %i',
        (count, radius) => {
            const { dotRadius, positions } = layoutDots(count, radius);
            expect(positions).toHaveLength(count);
            expect(dotRadius).toBeGreaterThan(0);
            if (count > 1) {
                // Full-size dots, with no help from the smaller "no account" ones
                expect(closest(positions)).toBeGreaterThanOrEqual(
                    dotRadius * 2,
                );
            }
            positions.forEach((position) => {
                expect(
                    Math.hypot(position.x, position.y) + dotRadius,
                ).toBeLessThanOrEqual(radius - 2 + 1e-9);
            });
        },
    );
    it.each(cases)(
        'lays out %i dots at radius %i the same every time',
        (count, radius) => {
            expect(layoutDots(count, radius)).toEqual(
                layoutDots(count, radius),
            );
        },
    );
    it('holds for every count up to 400 in the smallest circle and for thousands', () => {
        const check = (count: number, radius: number) => {
            const { dotRadius, positions } = layoutDots(count, radius);
            expect(closest(positions)).toBeGreaterThanOrEqual(dotRadius * 2);
        };
        for (let count = 2; count <= 400; count += 1) {
            check(count, MIN_CIRCLE_RADIUS);
        }
        [1000, 3000].forEach((count) => {
            check(count, MIN_CIRCLE_RADIUS);
            check(count, 250);
        });
    });
    it('finds the true closest pair of a sunflower from its spiral neighbours', () => {
        [8, 9, 13, 20, 50, 150, 400, 1000, 3000].forEach((count) => {
            expect(getSunflowerSpacing(count)).toBeCloseTo(
                closest(sunflowerPositions(count, 1)),
                12,
            );
        });
    });
    it('puts the first people innermost or first on the ring', () => {
        const three = layoutDots(3, 40).positions;
        // First at the top of the ring, the rest clockwise
        expect(three[0].x).toBeCloseTo(0, 9);
        expect(three[0].y).toBeLessThan(0);
        expect(three[1].x).toBeGreaterThan(0);
        const seven = layoutDots(7, 40).positions;
        expect(seven[0]).toEqual({ x: 0, y: 0 });
        const many = layoutDots(50, 40).positions.map((position) =>
            Math.hypot(position.x, position.y),
        );
        many.slice(1).forEach((distance, index) => {
            expect(distance).toBeGreaterThan(many[index]);
        });
    });
    it('keeps a few people readable wherever there is room', () => {
        [1, 2, 3, 5, 7, 8, 20].forEach((count) => {
            expect(layoutDots(count, 250).dotRadius).toBeCloseTo(11, 6);
        });
        // In a small circle the dots are as large as fit, not specks
        expect(layoutDots(3, 30).dotRadius).toBeGreaterThan(8);
        expect(layoutDots(2, MIN_CIRCLE_RADIUS).dotRadius).toBeGreaterThan(4);
    });
});
