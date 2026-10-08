import { type DepartmentWithMetrics } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    dept,
    metricsFixture,
    seededOrganization,
} from '../utils/adoptionFixtures';
import {
    buildPackInput,
    MIN_CIRCLE_RADIUS,
    type PackedCircle,
} from './geometry';
import {
    boxTouchesCircle,
    estimateTextWidth,
    fitToArea,
    getCaptionVariants,
    getDrillTargets,
    getLabelLines,
    layoutMap,
    placeLabels,
    type Area,
    type Box,
    type CircleLabel,
} from './mapLayout';
import { describeCircles } from './mapView';

const d = (
    name: string,
    parent: string | null,
    headcount: number | null,
    members: number,
    active: number,
) =>
    dept(name, parent, null, {
        headcount,
        effectiveHeadcount: headcount,
        metrics: metricsFixture(members, null, { activeCount30d: active }),
        directMetrics: metricsFixture(members, null, {
            activeCount30d: active,
        }),
    });

const PANEL: Area = { width: 760, height: 560 };

const build = (
    departments: DepartmentWithMetrics[],
    area: Area = PANEL,
    focus: string | null = null,
    zoom: number = 1,
) => {
    const byUuid = new Map(
        departments.map((each) => [each.departmentUuid, each]),
    );
    const describe = (circles: PackedCircle[]) =>
        describeCircles(circles, byUuid);
    const circles = layoutMap({
        input: buildPackInput(departments, focus),
        area,
        focusName: focus,
        describe,
        measure: estimateTextWidth,
    });
    const labels = placeLabels(
        circles,
        describe(circles),
        zoom,
        area,
        estimateTextWidth,
    );
    const find = (id: string) => {
        const circle = circles.find((each) => each.id === id);
        if (!circle) throw new Error(`No circle ${id}`);
        return circle;
    };
    return { circles, labels, find };
};

const contains = (outer: PackedCircle, inner: PackedCircle): boolean =>
    outer.depth < inner.depth &&
    Math.hypot(outer.x - inner.x, outer.y - inner.y) + inner.r <= outer.r + 0.5;

const boxesIntersect = (a: Box, b: Box): boolean =>
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;

// The rule every placement must meet: a label touches no other label, and no circle
// except the ones that contain its own circle
const expectCleanLabels = (
    circles: PackedCircle[],
    labels: CircleLabel[],
    area: Area,
    zoom: number = 1,
) => {
    labels.forEach((label, index) => {
        const own = circles.find((circle) => circle.id === label.id);
        expect(own).toBeDefined();
        if (!own) return;
        circles
            .filter((circle) => !contains(circle, own))
            .forEach((circle) => {
                expect(boxTouchesCircle(label.box, circle, zoom, 0)).toBe(
                    false,
                );
            });
        labels.slice(index + 1).forEach((other) => {
            expect(boxesIntersect(label.box, other.box)).toBe(false);
        });
        expect(label.box.x).toBeGreaterThanOrEqual(0);
        expect(label.box.y).toBeGreaterThanOrEqual(0);
        expect(label.box.x + label.box.width).toBeLessThanOrEqual(
            area.width * zoom,
        );
        expect(label.box.y + label.box.height).toBeLessThanOrEqual(
            area.height * zoom,
        );
    });
};

const share = (circles: PackedCircle[], area: Area) => {
    const tops = circles.filter((circle) => circle.depth === 1);
    const left = Math.min(...tops.map((circle) => circle.x - circle.r));
    const right = Math.max(...tops.map((circle) => circle.x + circle.r));
    const top = Math.min(...tops.map((circle) => circle.y - circle.r));
    const bottom = Math.max(...tops.map((circle) => circle.y + circle.r));
    return {
        width: (right - left) / area.width,
        height: (bottom - top) / area.height,
    };
};

const lopsided = [d('Huge', null, 4000, 10, 5), d('Tiny', null, 1, 1, 1)];
const crowd = Array.from({ length: 40 }, (_, index) =>
    d(`Department number ${index}`, null, 4 + index * 7, 3, 2),
);

describe('fitToArea', () => {
    it('fills the panel with the seeded organization', () => {
        const { circles } = build(seededOrganization());
        const filled = share(circles, PANEL);
        expect(filled.width).toBeGreaterThan(0.85);
        expect(filled.height).toBeGreaterThan(0.85);
    });
    it('gives a wide panel a wide arrangement', () => {
        const wide = { width: 1100, height: 560 };
        const filled = share(build(seededOrganization(), wide).circles, wide);
        expect(filled.width).toBeGreaterThan(0.85);
        expect(filled.height).toBeGreaterThan(0.85);
    });
    it('lets a single department fill the height', () => {
        const { circles } = build([d('Only', null, 12, 4, 1)]);
        expect(circles).toHaveLength(1);
        expect(share(circles, PANEL).height).toBeGreaterThan(0.85);
    });
    it.each([
        ['the seeded organization', seededOrganization(), PANEL],
        ['one huge and one tiny department', lopsided, PANEL],
        ['forty departments', crowd, PANEL],
        ['a narrow panel', seededOrganization(), { width: 420, height: 560 }],
    ])(
        'draws every circle of %s at the minimum radius or more',
        (_, tree, area) => {
            const circles = fitToArea(buildPackInput(tree, null), area);
            expect(circles.length).toBeGreaterThan(0);
            circles.forEach((circle) => {
                expect(circle.r).toBeGreaterThanOrEqual(
                    MIN_CIRCLE_RADIUS - 1e-6,
                );
            });
        },
    );
    it('flags a circle that had to be enlarged to reach the minimum', () => {
        const circles = fitToArea(buildPackInput(lopsided, null), PANEL);
        const tiny = circles.find((circle) => circle.id === 'Tiny');
        const huge = circles.find((circle) => circle.id === 'Huge');
        expect(tiny?.isAreaHonest).toBe(false);
        expect(huge?.isAreaHonest).toBe(true);
    });
    it('keeps every circle inside the panel, top-level circles apart and sub-departments inside their parent', () => {
        const { circles, find } = build(seededOrganization());
        circles.forEach((circle) => {
            expect(circle.x - circle.r).toBeGreaterThanOrEqual(0);
            expect(circle.x + circle.r).toBeLessThanOrEqual(PANEL.width);
            expect(circle.y - circle.r).toBeGreaterThanOrEqual(0);
            expect(circle.y + circle.r).toBeLessThanOrEqual(PANEL.height);
        });
        const tops = circles.filter((circle) => circle.depth === 1);
        tops.forEach((a, index) =>
            tops.slice(index + 1).forEach((b) => {
                expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(
                    a.r + b.r,
                );
            }),
        );
        ['Stores', 'Depots', 'North'].forEach((id) =>
            expect(contains(find('Operations'), find(id))).toBe(true),
        );
        ['Procurement', 'Logistics'].forEach((id) =>
            expect(contains(find('Supply chain'), find(id))).toBe(true),
        );
    });
    it('keeps areas in proportion to headcount', () => {
        const { find } = build(seededOrganization());
        expect(find('Finance').r / find('Marketing').r).toBeCloseTo(
            Math.sqrt(32 / 40),
            6,
        );
    });
    it('draws nothing for an empty tree', () => {
        expect(fitToArea(buildPackInput([], null), PANEL)).toEqual([]);
    });
});

describe('getDrillTargets', () => {
    it('opens the top-level department from anywhere inside its circle', () => {
        const targets = getDrillTargets(build(seededOrganization()).circles);
        expect(targets.get('Operations')).toBe('Operations');
        expect(targets.get('Stores')).toBe('Operations');
        expect(targets.get('own:Operations')).toBe('Operations');
        expect(targets.get('Logistics')).toBe('Supply chain');
        expect(targets.get('Finance')).toBe('Finance');
    });
    it('opens nothing from the lone circle of a department without sub-departments', () => {
        const { circles } = build(seededOrganization(), PANEL, 'Finance');
        expect([...getDrillTargets(circles).values()]).toEqual([null]);
    });
});

describe('getCaptionVariants', () => {
    it('goes from the full sentence to the bare numbers', () => {
        expect(
            getCaptionVariants({
                people: 60,
                members: 41,
                active: 33,
                headcount: 60,
            }),
        ).toEqual([
            '41 of 60 on Lightdash · 33 active',
            '41 of 60 · 33 active',
            '41 of 60',
        ]);
    });
    it('says all active instead of repeating the number', () => {
        expect(
            getCaptionVariants({
                people: 9,
                members: 9,
                active: 9,
                headcount: 9,
            })[1],
        ).toBe('9 of 9 · all active');
    });
    it('says when nobody is on Lightdash', () => {
        expect(
            getCaptionVariants({
                people: 80,
                members: 0,
                active: 0,
                headcount: 80,
            }),
        ).toEqual(['80 people · nobody on Lightdash', '80 · nobody yet', '80']);
    });
    it('says when there is no headcount', () => {
        expect(
            getCaptionVariants({
                people: 14,
                members: 14,
                active: 11,
                headcount: null,
            }),
        ).toEqual(['14 on Lightdash · no headcount', 'No headcount']);
    });
    it('groups thousands', () => {
        expect(
            getCaptionVariants({
                people: 3000,
                members: 412,
                active: 180,
                headcount: 3000,
            })[0],
        ).toBe('412 of 3,000 on Lightdash · 180 active');
    });
});

describe('placeLabels on the seeded organization', () => {
    const { circles, labels } = build(seededOrganization());
    const find = (id: string) => labels.find((label) => label.id === id);
    const topLevel = [
        'Operations',
        'Supply chain',
        'Marketing',
        'Finance',
        'Data',
        'Product',
    ];

    it('gives every top-level department its full name and a line of numbers', () => {
        topLevel.forEach((id) => {
            expect(find(id)?.name).toBe(id);
            expect(find(id)?.detail).not.toBeNull();
        });
        expect(find('Product')?.detail).toMatch(/no headcount/i);
        expect(find('Finance')?.detail).toMatch(/^32/);
    });
    it('touches no other label and no circle the label does not belong to', () => {
        expectCleanLabels(circles, labels, PANEL);
    });
    it('keeps sub-department labels off the dots, including their own', () => {
        const stores = find('Stores');
        expect(stores).toBeDefined();
        const dotted = circles.filter((circle) => circle.people !== null);
        expect(dotted.length).toBeGreaterThan(5);
        dotted.forEach((circle) => {
            if (stores) {
                expect(boxTouchesCircle(stores.box, circle, 1, 0)).toBe(false);
            }
        });
    });
    it('does not shorten a name that has room', () => {
        expect(find('Procurement')?.name).toBe('Procurement · 30');
        expect(find('Logistics')?.name).toBe('Logistics · 50');
        labels.forEach((label) => expect(label.name).not.toContain('…'));
    });
    it('leaves the people directly in a department unlabelled', () => {
        expect(circles.some((circle) => circle.id === 'own:Operations')).toBe(
            true,
        );
        expect(find('own:Operations')).toBeUndefined();
    });
    it('stays clean in a wide panel, a narrow one and inside a department', () => {
        [
            { width: 1100, height: 560 },
            { width: 420, height: 560 },
        ].forEach((area) => {
            const narrow = build(seededOrganization(), area);
            expectCleanLabels(narrow.circles, narrow.labels, area);
        });
        const inside = build(seededOrganization(), PANEL, 'Operations');
        expectCleanLabels(inside.circles, inside.labels, PANEL);
        expect(
            inside.labels.find((label) => label.id === 'Stores')?.detail,
        ).not.toBeNull();
    });
    it('stays clean when zoomed in', () => {
        const zoomed = build(seededOrganization(), PANEL, null, 3);
        expectCleanLabels(zoomed.circles, zoomed.labels, PANEL, 3);
        expect(zoomed.labels.length).toBeGreaterThanOrEqual(labels.length);
    });
});

describe('placeLabels on a crowded map', () => {
    const { circles, labels } = build(crowd);
    it('leaves labels out rather than overlapping anything', () => {
        expectCleanLabels(circles, labels, PANEL);
        expect(labels.length).toBeGreaterThan(10);
        expect(labels.length).toBeLessThanOrEqual(circles.length);
    });
    it('labels one huge department and the tiny one beside it', () => {
        const pair = build(lopsided);
        expectCleanLabels(pair.circles, pair.labels, PANEL);
        expect(pair.labels.map((label) => label.id).sort()).toEqual([
            'Huge',
            'Tiny',
        ]);
    });
});

describe('getLabelLines', () => {
    const base: CircleLabel = {
        id: 'x',
        placement: 'below',
        isNested: false,
        name: 'Finance',
        detail: '32 · nobody yet',
        box: { x: 100, y: 200, width: 96, height: 30 },
    };
    it('centres two lines in the footprint under a circle', () => {
        const [name, detail] = getLabelLines(base, 1);
        expect(name).toMatchObject({
            role: 'name',
            text: 'Finance',
            x: 148,
            anchor: 'middle',
        });
        expect(detail).toMatchObject({ role: 'detail', x: 148 });
        expect(name.y).toBeGreaterThan(200);
        expect(detail.y).toBeGreaterThan(name.y);
        expect(detail.y).toBeLessThanOrEqual(230);
    });
    it('reads away from the circle when placed beside it', () => {
        const [right] = getLabelLines({ ...base, placement: 'right' }, 1);
        const [left] = getLabelLines({ ...base, placement: 'left' }, 1);
        expect(right).toMatchObject({ anchor: 'start', x: 100 });
        expect(left).toMatchObject({ anchor: 'end', x: 196 });
    });
    it('converts the screen footprint back to map coordinates when zoomed', () => {
        const [name] = getLabelLines(base, 4);
        expect(name.x).toBe(37);
        expect(name.y).toBeCloseTo(getLabelLines(base, 1)[0].y / 4, 6);
    });
    it('draws a sub-department label as one line', () => {
        expect(
            getLabelLines(
                { ...base, isNested: true, name: 'Stores · 22', detail: null },
                1,
            ),
        ).toHaveLength(1);
    });
});
