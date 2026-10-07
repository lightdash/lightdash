import {
    OrganizationMemberRole,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { dept, memberFixture, metricsFixture } from '../utils/adoptionFixtures';
import {
    buildPackInput,
    countPeople,
    expandDots,
    getDotRadius,
    getDotSegments,
    getMemberDotKind,
    layoutDots,
    layoutPack,
    MIN_CIRCLE_RADIUS,
    orderMembersForDots,
    shouldRenderDots,
    sunflowerPositions,
    SVG_DOT_LIMIT,
    truncateLabel,
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
        expect(getDotRadius(1, 400)).toBeLessThanOrEqual(5);
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
    it('enforces a minimum radius and flags the circle as not area-honest', () => {
        const circles = layoutPack(
            buildPackInput(
                [d('Huge', null, 5000, 10), d('Tiny', null, 1, 1)],
                null,
            ),
            720,
        );
        const byId = new Map(circles.map((c) => [c.id, c]));
        expect(byId.get('Tiny')).toMatchObject({
            r: MIN_CIRCLE_RADIUS,
            isAreaHonest: false,
        });
        expect(byId.get('Huge')?.isAreaHonest).toBe(true);
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
