import { type DepartmentWithMetrics } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import {
    dept,
    metricsFixture,
    seededOrganization,
    withServerHeadcounts,
} from '../utils/adoptionFixtures';
import {
    buildPackInput,
    layoutPack,
    MIN_CIRCLE_RADIUS,
    type PackedCircle,
} from './geometry';
import {
    boxTouchesCircle,
    estimateTextWidth,
    fitToArea,
    getCaptionVariants,
    getControlsBox,
    getHoverLabel,
    getTopLevelGroups,
    getLabelLines,
    LABELS_AT_REST,
    layoutMap,
    placeLabels,
    type Area,
    type Box,
    type CircleLabel,
} from './mapLayout';
import { describeCircles, nameLoneBucket } from './mapView';
import { deepOrganization, flatOrganization } from './organizationFixtures';

const d = (
    name: string,
    parent: string | null,
    headcount: number | null,
    members: number,
    active: number,
    directMembers: number = members,
) =>
    dept(name, parent, null, {
        headcount,
        effectiveHeadcount: Math.max(headcount ?? 0, members),
        hasHeadcount: headcount !== null,
        metrics: metricsFixture(members, null, { activeCount30d: active }),
        directMetrics: metricsFixture(directMembers, null, {
            activeCount30d: directMembers === members ? active : 0,
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
    // Labels at rest are placed only while they are turned on
    const labels = LABELS_AT_REST
        ? placeLabels(circles, describe(circles), zoom, area, estimateTextWidth)
        : [];
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

// The rule every placement must meet: a label touches no other label, no circle except the ones
// its own circle is drawn inside (and its own, when inside it), and stays inside the drawing
const expectCleanLabels = (
    circles: PackedCircle[],
    labels: CircleLabel[],
    area: Area,
    zoom: number = 1,
) => {
    const byId = new Map(circles.map((circle) => [circle.id, circle]));
    labels.forEach((label, index) => {
        const own = byId.get(label.id);
        expect(own).toBeDefined();
        if (!own) return;
        const allowed = new Set<string>();
        let parentId = own.parentId;
        while (parentId !== null && !allowed.has(parentId)) {
            allowed.add(parentId);
            parentId = byId.get(parentId)?.parentId ?? null;
        }
        if (label.placement === 'inside') allowed.add(own.id);
        circles
            .filter((circle) => !allowed.has(circle.id))
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
        'enlarges the small circles of %s without overlapping anything',
        (_, tree, area) => {
            const circles = fitToArea(buildPackInput(tree, null), area);
            const byId = new Map(circles.map((circle) => [circle.id, circle]));
            expect(circles.length).toBeGreaterThan(0);
            circles.forEach((circle) => {
                const parent =
                    circle.parentId === null ? null : byId.get(circle.parentId);
                if (parent) expect(contains(parent, circle)).toBe(true);
                circles
                    .filter(
                        (other) =>
                            other.id !== circle.id &&
                            other.parentId === circle.parentId,
                    )
                    .forEach((other) => {
                        expect(
                            Math.hypot(circle.x - other.x, circle.y - other.y),
                        ).toBeGreaterThanOrEqual(circle.r + other.r - 1e-6);
                    });
            });
        },
    );
    it('flags a circle that had to be enlarged to reach the minimum', () => {
        const circles = fitToArea(buildPackInput(lopsided, null), PANEL);
        const tiny = circles.find((circle) => circle.id === 'Tiny');
        const huge = circles.find((circle) => circle.id === 'Huge');
        expect(tiny?.isAreaHonest).toBe(false);
        expect(tiny?.r).toBeCloseTo(MIN_CIRCLE_RADIUS, 6);
        expect(huge?.isAreaHonest).toBe(true);
    });
    it('enlarges a small leaf without enlarging its parent', () => {
        // Group and Big hold the same number of people, so they are drawn the same size
        const departments = withServerHeadcounts([
            d('Big', null, 1000, 10, 5),
            d('Group', null, 1000, 10, 5, 0),
            d('Core', 'Group', 997, 9, 5),
            d('Tiny', 'Group', 3, 1, 0),
        ]);
        const input = buildPackInput(departments, null);
        // The drawing is packed at the panel's shorter side before it is fitted
        const packed = new Map(
            layoutPack(input, Math.min(PANEL.width, PANEL.height)).map(
                (circle) => [circle.id, circle],
            ),
        );
        const fitted = new Map(
            fitToArea(input, PANEL).map((circle) => [circle.id, circle]),
        );
        const get = (circles: Map<string, PackedCircle>, id: string) => {
            const circle = circles.get(id);
            if (!circle) throw new Error(`No circle ${id}`);
            return circle;
        };
        const scale = get(fitted, 'Big').r / get(packed, 'Big').r;
        expect(get(fitted, 'Tiny').r).toBeGreaterThan(
            get(packed, 'Tiny').r * scale + 1,
        );
        expect(get(fitted, 'Tiny').isAreaHonest).toBe(false);
        expect(get(fitted, 'Group').r).toBeCloseTo(get(fitted, 'Big').r, 6);
        expect(get(fitted, 'Group').r).toBeCloseTo(
            get(packed, 'Group').r * scale,
            6,
        );
        expect(get(fitted, 'Group').isAreaHonest).toBe(true);
        expect(get(fitted, 'Core').r).toBeCloseTo(
            get(packed, 'Core').r * scale,
            6,
        );
        expect(contains(get(fitted, 'Group'), get(fitted, 'Tiny'))).toBe(true);
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
    it('never draws a department smaller than one beside it with fewer people', () => {
        // The panel of a 1,024 px window: Executive Office (12 people, no sub-departments) once drew
        // larger than Data & Analytics (70, with sub-departments), which was never enlarged
        const { circles, find } = build(deepOrganization, {
            width: 346,
            height: 560,
        });
        expect(find('Data & Analytics').r).toBeGreaterThanOrEqual(
            find('Executive Office').r,
        );
        expect(find('People').r).toBeGreaterThanOrEqual(
            find('Legal & Compliance').r,
        );
        circles.forEach((circle) =>
            circles
                .filter(
                    (other) =>
                        other.parentId === circle.parentId &&
                        other.size < circle.size,
                )
                .forEach((smaller) => {
                    expect(circle.r).toBeGreaterThanOrEqual(smaller.r - 1e-9);
                }),
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

describe('layoutMap', () => {
    it('draws no labels at rest, so it makes no room for them and the circles keep the size the pack gives them', () => {
        expect(LABELS_AT_REST).toBe(false);
        [
            {
                departments: deepOrganization,
                area: { width: 360, height: 560 },
            },
            { departments: flatOrganization, area: PANEL },
            { departments: seededOrganization(), area: PANEL },
        ].forEach(({ departments, area }) => {
            const input = buildPackInput(departments, null);
            const describe = vi.fn(() => new Map());
            const measure = vi.fn(estimateTextWidth);
            const circles = layoutMap({
                input,
                area,
                focusName: null,
                describe,
                measure,
            });
            // Nothing is described or measured for labels, and nothing is spread apart for them
            expect(describe).not.toHaveBeenCalled();
            expect(measure).not.toHaveBeenCalled();
            expect(circles).toEqual(fitToArea(input, area));
        });
        // A department without sub-departments still carries its own name
        const lone = buildPackInput(seededOrganization(), 'Finance');
        expect(
            layoutMap({
                input: lone,
                area: PANEL,
                focusName: 'Finance',
                describe: () => new Map(),
                measure: estimateTextWidth,
            }),
        ).toEqual(nameLoneBucket(fitToArea(lone, PANEL), 'Finance'));
    });
});

// Labels at rest are off; these keep the placement engine covered for when they are turned back on
describe.skipIf(!LABELS_AT_REST)('layoutMap with labels at rest', () => {
    it('keeps circles at 70 % of their size or more when shrinking further still leaves labels out', () => {
        // Thirty departments with long names in one panel: some labels never find room
        const flat = Array.from({ length: 30 }, (_, index) =>
            d(
                `A department with a long name, number ${index}`,
                null,
                40 + index * 9,
                10,
                4,
            ),
        );
        const first = Math.max(
            ...fitToArea(buildPackInput(flat, null), PANEL).map(
                (circle) => circle.r,
            ),
        );
        const { circles, labels } = build(flat);
        const labelled = new Set(labels.map((label) => label.id));
        expect(
            circles.some(
                (circle) => circle.depth === 1 && !labelled.has(circle.id),
            ),
        ).toBe(true);
        expect(
            Math.max(...circles.map((circle) => circle.r)),
        ).toBeGreaterThanOrEqual(first * 0.7 - 1e-9);
    });
});

describe('getTopLevelGroups', () => {
    it('groups everything inside a top-level circle under the department a click opens', () => {
        const groups = getTopLevelGroups(build(seededOrganization()).circles);
        const operations = groups.find(
            (group) => group.anchor.id === 'Operations',
        );
        expect(operations?.opens).toBe('Operations');
        expect(operations?.circles[0].id).toBe('Operations');
        // Operations' 40 leaves 8 over its sub-departments, drawn as its own circle though nobody is in it yet
        expect(operations?.circles.map((circle) => circle.id).sort()).toEqual([
            'Depots',
            'North',
            'Operations',
            'Stores',
            'own:Operations',
        ]);
        expect(
            groups.find((group) => group.anchor.id === 'Finance')?.circles,
        ).toHaveLength(1);
        expect(
            groups
                .map((group) => group.opens ?? '')
                .sort((x, y) => x.localeCompare(y)),
        ).toEqual([
            'Data',
            'Finance',
            'Marketing',
            'Operations',
            'Product',
            'Supply chain',
        ]);
    });
    it('opens nothing from the lone circle of a department without sub-departments', () => {
        const { circles } = build(seededOrganization(), PANEL, 'Finance');
        expect(getTopLevelGroups(circles).map((group) => group.opens)).toEqual([
            null,
        ]);
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
                isDirect: false,
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
                isDirect: false,
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
                isDirect: false,
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
                isDirect: false,
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
                isDirect: false,
            })[0],
        ).toBe('412 of 3,000 on Lightdash · 180 active');
    });
    it('counts the people directly in a department in full, over the headcount kept for them', () => {
        expect(
            getCaptionVariants({
                people: 80,
                members: 50,
                active: 12,
                headcount: 80,
                isDirect: true,
            }),
        ).toEqual(['50 of 80 on Lightdash · 12 active']);
        expect(
            getCaptionVariants({
                people: 3,
                members: 3,
                active: 3,
                headcount: 3,
                isDirect: true,
            }),
        ).toEqual(['3 of 3 on Lightdash · all active']);
        expect(
            getCaptionVariants({
                people: 8,
                members: 0,
                active: 0,
                headcount: 8,
                isDirect: true,
            }),
        ).toEqual(['0 of 8 on Lightdash · 0 active']);
    });
    it('quotes no headcount for the people directly in a department without one', () => {
        expect(
            getCaptionVariants({
                people: 4,
                members: 4,
                active: 1,
                headcount: null,
                isDirect: true,
            }),
        ).toEqual(['4 on Lightdash · 1 active']);
    });
});

describe.skipIf(!LABELS_AT_REST)(
    'placeLabels on the seeded organization',
    () => {
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
        it('never overlaps another label', () => {
            expectCleanLabels(circles, labels, PANEL);
        });
        it("keeps every top-level label off other departments' circles", () => {
            const groups = getTopLevelGroups(circles);
            labels
                .filter((label) => !label.isNested)
                .forEach((label) => {
                    const own =
                        groups.find((group) => group.anchor.id === label.id)
                            ?.circles ?? [];
                    circles
                        .filter((circle) => !own.includes(circle))
                        .forEach((circle) => {
                            expect(
                                boxTouchesCircle(label.box, circle, 1, 0),
                            ).toBe(false);
                        });
                });
        });
        it('names a sub-department once it is drawn large enough to point at, and leaves smaller ones to hover', () => {
            const nested = circles.filter(
                (circle) => circle.depth > 1 && circle.kind === 'department',
            );
            expect(nested.some((circle) => circle.r >= 16)).toBe(true);
            expect(nested.some((circle) => circle.r < 16)).toBe(true);
            nested.forEach((circle) => {
                expect(find(circle.id) !== undefined).toBe(circle.r >= 16);
            });
        });
        it('does not shorten a name that has room', () => {
            expect(find('Procurement')?.name).toMatch(/^Procurement( · 30)?$/);
            expect(find('Logistics')?.name).toMatch(/^Logistics( · 50)?$/);
            labels.forEach((label) => expect(label.name).not.toContain('…'));
        });
        it.each([
            [760, 560],
            [1100, 560],
        ])(
            'keeps labels off the zoom buttons and inside a %ix%i panel',
            (width, height) => {
                const area = { width, height };
                const fitted = build(seededOrganization(), area);
                const controls = getControlsBox(area);
                expect(controls).toEqual({
                    x: 0,
                    y: height - 46,
                    width: 172,
                    height: 46,
                });
                expect(fitted.labels.length).toBeGreaterThanOrEqual(10);
                fitted.labels.forEach((label) => {
                    expect(boxesIntersect(label.box, controls)).toBe(false);
                    expect(label.box.x).toBeGreaterThanOrEqual(6);
                    expect(label.box.y).toBeGreaterThanOrEqual(6);
                    expect(label.box.x + label.box.width).toBeLessThanOrEqual(
                        width - 6,
                    );
                    expect(label.box.y + label.box.height).toBeLessThanOrEqual(
                        height - 6,
                    );
                });
                topLevel.forEach((id) => {
                    const label = fitted.labels.find((each) => each.id === id);
                    expect(label?.name).toBe(id);
                    expect(label?.detail).not.toBeNull();
                });
                expectCleanLabels(fitted.circles, fitted.labels, area);
            },
        );
        it('places the same labels whatever order the departments arrive in', () => {
            const seededTree = seededOrganization();
            const expected = labels.map((label) => ({ ...label }));
            [
                [...seededTree].reverse(),
                [...seededTree.slice(4), ...seededTree.slice(0, 4)],
            ].forEach((order) => {
                const reordered = build(order).labels;
                expect(
                    [...reordered].sort((a, b) => a.id.localeCompare(b.id)),
                ).toEqual(
                    [...expected].sort((a, b) => a.id.localeCompare(b.id)),
                );
            });
        });
        it('puts a label above its circle rather than on the zoom buttons', () => {
            // Every spot under this circle is on the buttons or past the bottom of the panel
            const corner = placedCircle('Corner department', 60, 470, 30);
            const controls = getControlsBox(PANEL);
            expect(
                boxesIntersect(
                    { x: 0, y: 504, width: 172, height: 30 },
                    controls,
                ),
            ).toBe(true);
            const [label] = placeOn([corner]);
            expect(label).toMatchObject({ placement: 'above' });
            expect(boxesIntersect(label.box, controls)).toBe(false);
            expect(label.box.y + label.box.height).toBeLessThanOrEqual(
                470 - 30 - 4,
            );
            // Zoomed in, the buttons no longer cover the same part of the map
            const zoomed = placeLabels(
                [corner],
                describeCircles(
                    [corner],
                    new Map([[corner.id, d(corner.id, null, 10, 4, 1)]]),
                ),
                2,
                PANEL,
                estimateTextWidth,
            );
            expect(zoomed).toHaveLength(1);
            expect(zoomed[0].placement).toBe('below');
        });
        it('never puts a label further than 48 px from its circle', () => {
            // The panel of a 420 px window, where a label once moved 52 px down from its circle
            const area = { width: 394, height: 560 };
            const drawn = build(deepOrganization, area);
            const executive = drawn.labels.find(
                (label) => label.id === 'Executive Office',
            );
            expect(executive).toBeDefined();
            drawn.labels.forEach((label) => {
                const circle = drawn.find(label.id);
                if (label.placement === 'below') {
                    expect(
                        label.box.y - (circle.y + circle.r),
                    ).toBeLessThanOrEqual(48);
                }
                if (label.placement === 'above') {
                    expect(
                        circle.y - circle.r - (label.box.y + label.box.height),
                    ).toBeLessThanOrEqual(48);
                }
            });
        });
        it('leaves the people directly in a department unlabelled', () => {
            expect(
                circles.some((circle) => circle.id === 'own:Operations'),
            ).toBe(true);
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
    },
);

// One level down in a large organization: Supply chain's own sub-departments sit inside it
const operations = withServerHeadcounts([
    d('Operations', null, 2350, 221, 126, 2),
    d('Supply chain', 'Operations', 1750, 170, 96, 0),
    d('Warehousing', 'Supply chain', 900, 12, 3),
    d('Logistics', 'Supply chain', 600, 48, 27),
    d('Demand planning', 'Supply chain', 120, 75, 45),
    d('Procurement operations', 'Supply chain', 80, 35, 21),
    d('Facilities', 'Operations', 120, 12, 7),
    d('Health and safety', 'Operations', 45, 8, 5),
    d('Quality', 'Operations', 90, 29, 17),
]);

const placedCircle = (
    id: string,
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
    size: 10,
    people: { metrics: metricsFixture(4, null), headcount: 10 },
    depth: 1,
    parentId: null,
    x,
    y,
    r,
    isAreaHonest: true,
});

const placeOn = (circles: PackedCircle[], area: Area = PANEL) =>
    placeLabels(
        circles,
        describeCircles(
            circles,
            new Map(
                circles.map((circle) => [
                    circle.id,
                    d(circle.id, null, 10, 4, 1),
                ]),
            ),
        ),
        1,
        area,
        estimateTextWidth,
    );

describe.skipIf(!LABELS_AT_REST)('placeLabels at the focused level', () => {
    const { circles, labels } = build(operations, PANEL, 'Operations');
    const labelOf = (id: string) => labels.find((label) => label.id === id);

    it('labels every circle at the focused level, and the sub-departments inside them that have room', () => {
        const focused = circles.filter((circle) => circle.depth === 1);
        expect(focused.map((circle) => circle.id).sort()).toEqual(
            [
                'Facilities',
                'Health and safety',
                'Quality',
                'Supply chain',
                'own:Operations',
            ].sort(),
        );
        focused.forEach((circle) => {
            expect(labelOf(circle.id)).toBeDefined();
        });
        ['Warehousing', 'Logistics'].forEach((id) => {
            expect(labelOf(id)).toBeDefined();
        });
        expectCleanLabels(circles, labels, PANEL);
    });
    it("never puts a label over another department's circle at the same level", () => {
        labels.forEach((label) => {
            const own = circles.find((circle) => circle.id === label.id);
            circles
                .filter(
                    (circle) =>
                        circle.id !== label.id && circle.depth === own?.depth,
                )
                .forEach((circle) => {
                    expect(boxTouchesCircle(label.box, circle, 1, 0)).toBe(
                        false,
                    );
                });
        });
    });
    it('puts a label under a circle of people rather than over them', () => {
        const warehousing = circles.find(
            (circle) => circle.id === 'Warehousing',
        );
        const label = labelOf('Warehousing');
        expect(label).toMatchObject({
            placement: 'below',
            name: 'Warehousing · 900',
            hasBacking: false,
        });
        if (warehousing && label) {
            expect(label.box.y).toBeGreaterThan(warehousing.y + warehousing.r);
        }
        const small = labelOf('Health and safety');
        const circle = circles.find((each) => each.id === 'Health and safety');
        expect(small?.placement).toBe('below');
        if (small && circle) {
            expect(small.box.y).toBeGreaterThanOrEqual(circle.y);
        }
    });
    it('never puts a label inside a circle that holds sub-departments', () => {
        expect(labelOf('Supply chain')?.placement).toBe('below');
    });
    it('puts a label inside its circle first when no people are drawn in it', () => {
        // Three times the people: above 5,000 the dots are hidden, so the circles are empty
        const large = operations.map((department) => ({
            ...department,
            headcount: (department.headcount ?? 0) * 3,
            effectiveHeadcount: department.effectiveHeadcount * 3,
        }));
        const drawn = build(large, PANEL, 'Operations');
        expect(
            drawn.labels.find((label) => label.id === 'Warehousing'),
        ).toMatchObject({
            placement: 'inside',
            name: 'Warehousing · 2,700',
            hasBacking: false,
        });
    });
});

describe.skipIf(!LABELS_AT_REST)('placeLabels over people', () => {
    // More than 150 people, so first names are not drawn and a label may go over the dots
    const crowded = (
        id: string,
        x: number,
        y: number,
        r: number,
    ): PackedCircle => ({
        ...placedCircle(id, x, y, r),
        people: { metrics: metricsFixture(200, null), headcount: 300 },
    });

    it('puts the label under a circle of people when there is room, never over them', () => {
        const [label] = placeOn([crowded('Customer service', 380, 250, 120)]);
        expect(label).toMatchObject({ placement: 'below', hasBacking: false });
        expect(label.box.y).toBeGreaterThanOrEqual(250 + 120);
    });
    it('puts it over the people, on a backing, only when nothing outside the circle is free', () => {
        // The circle fills the panel from top to bottom, so there is no room under or over it
        const [label] = placeOn([crowded('Customer service', 380, 280, 278)]);
        expect(label).toMatchObject({ placement: 'inside', hasBacking: true });
        expectCleanLabels(
            [crowded('Customer service', 380, 280, 278)],
            [label],
            PANEL,
        );
    });
});

describe.skipIf(!LABELS_AT_REST)('placeLabels by headcount', () => {
    const sized = (
        id: string,
        x: number,
        y: number,
        r: number,
        size: number,
    ): PackedCircle => ({ ...placedCircle(id, x, y, r), size });

    it('lets the circle with more people claim a contested spot first, whatever its drawn size', () => {
        // Drawn smaller but holding more people, so its label takes the spot right under it
        const more = sized('More people', 300, 200, 16, 100);
        const fewer = sized('Fewer people', 360, 200, 18, 50);
        const labels = placeOn([fewer, more]);
        const first = labels.find((label) => label.id === 'More people');
        expect(first?.placement).toBe('below');
        expect(first?.box.y).toBeCloseTo(200 + 16 + 4, 6);
        expectCleanLabels([fewer, more], labels, PANEL);
    });
    it('lets a smaller sibling take a free spot elsewhere when a larger one finds none', () => {
        // Middle is boxed in by Top and Bottom and goes without; Open has fewer people but room of its own
        const stack = [
            sized('Top department', 300, 150, 16, 200),
            sized('Middle department', 300, 200, 16, 100),
            sized('Bottom department', 300, 250, 16, 200),
            sized('Open department', 600, 300, 16, 10),
        ];
        const labels = placeOn(stack);
        expect(labels.map((label) => label.id).sort()).toEqual([
            'Bottom department',
            'Open department',
            'Top department',
        ]);
        expectCleanLabels(stack, labels, PANEL);
    });
});

describe.skipIf(!LABELS_AT_REST)('placeLabels under small circles', () => {
    it("shortens a label to the circle's width plus 80 pixels", () => {
        const long = 'Procurement operations and vendor management';
        const [label] = placeOn([placedCircle(long, 300, 200, 16)]);
        expect(label.placement).toBe('below');
        expect(label.name.endsWith('…')).toBe(true);
        expect(label.name.length).toBeLessThan(long.length);
        expect(label.box.width).toBeLessThanOrEqual(16 * 2 + 80);
    });
    it('moves a label down, away from its own circle, to clear another label', () => {
        // The first label reaches under the second circle's label, but not under the circle itself
        const left = placedCircle('Customer operations', 280, 200, 16);
        const right = placedCircle('Revenue operations', 360, 200, 16);
        const labels = placeOn([left, right]);
        expect(labels.map((label) => label.id)).toEqual([
            'Customer operations',
            'Revenue operations',
        ]);
        const [first, second] = labels;
        expect(boxesIntersect(first.box, second.box)).toBe(false);
        // The first keeps its spot right under its circle; the second moves further down, never across its own
        expect(first.box.y).toBeCloseTo(200 + 16 + 4, 6);
        expect(second.placement).toBe('below');
        expect(second.box.y).toBeGreaterThan(200 + 16 + 4);
        expect(boxTouchesCircle(second.box, right, 1, 0)).toBe(false);
        expect(second.box.x + second.box.width / 2).toBeCloseTo(360, 6);
    });
    it('never moves a label past another label that sits between it and its circle', () => {
        // Here the first label reaches under the second circle, so the second cannot move down past it
        const left = placedCircle('Customer operations', 300, 200, 16);
        const right = placedCircle('Revenue operations', 360, 200, 16);
        const labels = placeOn([left, right]);
        const second = labels.find(
            (label) => label.id === 'Revenue operations',
        );
        expect(second?.placement).toBe('above');
        expectCleanLabels([left, right], labels, PANEL);
    });
    it('tries the shorter wording under a circle before any wording over it', () => {
        // The name and its numbers would touch the circle below; the name alone fits
        const named = placedCircle('Wording department', 300, 200, 16);
        const below = placedCircle('Below', 300, 255, 10);
        const label = placeOn([named, below]).find(
            (each) => each.id === 'Wording department',
        );
        expect(label).toMatchObject({ placement: 'below', detail: null });
    });
    it("puts a label above its circle when every spot under it is on another department's circle", () => {
        // The spots under Upper are on Lower's circle, or beyond it
        const upper = placedCircle('Upper department', 300, 200, 16);
        const lower = placedCircle('Lower department', 300, 250, 16);
        const labels = placeOn([upper, lower]);
        expect(
            labels
                .map((label) => [label.id, label.placement])
                .sort(([a], [b]) => a.localeCompare(b)),
        ).toEqual([
            ['Lower department', 'below'],
            ['Upper department', 'above'],
        ]);
        const above = labels.find((label) => label.id === 'Upper department');
        // Above the circle and moved, if at all, further up, away from it
        expect(
            (above?.box.y ?? 0) + (above?.box.height ?? 0),
        ).toBeLessThanOrEqual(200 - 16 - 4 + 1e-9);
        expectCleanLabels([upper, lower], labels, PANEL);
    });
    it("leaves a label out rather than put it on another department's circle or past it", () => {
        // Middle is boxed in: Top above it and Bottom below it
        const stack = [
            placedCircle('Top department', 300, 150, 16),
            placedCircle('Middle department', 300, 200, 16),
            placedCircle('Bottom department', 300, 250, 16),
        ];
        const labels = placeOn(stack);
        expect(labels.map((label) => label.id).sort()).toEqual([
            'Bottom department',
            'Top department',
        ]);
        expectCleanLabels(stack, labels, PANEL);
    });
    it('leaves a label out when no move clears the others', () => {
        const stack = Array.from({ length: 12 }, (_, index) =>
            placedCircle(`Department number ${index}`, 300 + index * 3, 200, 8),
        );
        const labels = placeOn(stack);
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.length).toBeLessThan(stack.length);
        expectCleanLabels(stack, labels, PANEL);
    });
});

describe.skipIf(!LABELS_AT_REST)('placeLabels on a crowded map', () => {
    const { circles, labels } = build(crowd);
    it('leaves labels out rather than overlapping another label or circle', () => {
        expectCleanLabels(circles, labels, PANEL);
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.length).toBeLessThan(circles.length);
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

describe('getHoverLabel', () => {
    it('shows a hover label above its circle rather than on the zoom buttons', () => {
        const corner = placedCircle('Corner department', 60, 470, 30);
        const info = describeCircles(
            [corner],
            new Map([[corner.id, d(corner.id, null, 10, 4, 1)]]),
        );
        const hover = getHoverLabel(corner, info, 1, PANEL, estimateTextWidth);
        expect(hover?.placement).toBe('above');
        expect(hover && boxesIntersect(hover.box, getControlsBox(PANEL))).toBe(
            false,
        );
        // Away from the buttons it stays under the circle
        const middle = placedCircle('Middle department', 380, 200, 30);
        expect(
            getHoverLabel(
                middle,
                describeCircles(
                    [middle],
                    new Map([[middle.id, d(middle.id, null, 10, 4, 1)]]),
                ),
                1,
                PANEL,
                estimateTextWidth,
            )?.placement,
        ).toBe('below');
    });
    it('names a department with its numbers, and a sub-department with its count, in full', () => {
        const { circles } = build(seededOrganization());
        const info = describeCircles(
            circles,
            new Map(
                seededOrganization().map((each) => [each.departmentUuid, each]),
            ),
        );
        const hoverOf = (id: string) => {
            const circle = circles.find((each) => each.id === id);
            if (!circle) throw new Error(`No circle ${id}`);
            return getHoverLabel(circle, info, 1, PANEL, estimateTextWidth);
        };
        expect(hoverOf('Operations')).toMatchObject({
            name: 'Operations',
            detail: '1 of 40',
            isNested: false,
        });
        expect(hoverOf('Product')).toMatchObject({
            name: 'Product',
            detail: 'No headcount',
        });
        expect(hoverOf('Stores')).toMatchObject({
            name: 'Stores · 22',
            detail: null,
            isNested: true,
        });
    });
    it('leaves the people directly in a department nested in its circle unnamed', () => {
        // Supply chain's own people sit beside its sub-departments, inside it
        const departments = [
            d('Supply chain', null, 80, 6, 2, 4),
            d('Logistics', 'Supply chain', 50, 2, 1),
        ];
        const { circles } = build(departments);
        const direct = circles.find((each) => each.id === 'own:Supply chain');
        expect(direct).toMatchObject({ kind: 'direct', depth: 2 });
        if (!direct) return;
        expect(
            getHoverLabel(
                direct,
                describeCircles(
                    circles,
                    new Map(
                        departments.map((each) => [each.departmentUuid, each]),
                    ),
                ),
                1,
                PANEL,
                estimateTextWidth,
            ),
        ).toBeNull();
    });
    it("quotes a department's headcount for its one circle, and the headcount kept for the people directly in it", () => {
        const data = withServerHeadcounts([
            d('Data', null, 110, 191, 85, 84),
            d('Analytics', 'Data', 64, 63, 29),
            d('Engineering', 'Data', 34, 33, 10),
            d('Science', 'Data', 12, 11, 3),
            d('Governance', null, 8, 9, 9),
        ]);
        const byUuid = new Map(data.map((each) => [each.departmentUuid, each]));
        const hoverIn = (focus: string, id: string) => {
            const { circles } = build(data, PANEL, focus);
            const circle = circles.find((each) => each.id === id);
            if (!circle) throw new Error(`No circle ${id}`);
            return getHoverLabel(
                circle,
                describeCircles(circles, byUuid),
                1,
                PANEL,
                estimateTextWidth,
            );
        };
        // A department without sub-departments whose headcount of 8 counts its 9 people on Lightdash
        expect(hoverIn('Governance', 'own:Governance')).toMatchObject({
            name: 'Governance',
            detail: '9 of 9',
        });
        // The people directly in a department, over what Data keeps for them beside its sub-departments' 110
        expect(hoverIn('Data', 'own:Data')).toMatchObject({
            name: 'Directly in Data',
            detail: '84 of 84 on Lightdash · 0 active',
        });
    });
    it('moves a label under a circle as tall as the drawing right of the zoom buttons', () => {
        // No room over the circle, and under it the label would reach the buttons
        const area = { width: 940, height: 560 };
        const tall = placedCircle(
            'A department with a long name',
            239,
            265,
            227,
        );
        const hover = getHoverLabel(
            tall,
            describeCircles(
                [tall],
                new Map([[tall.id, d(tall.id, null, 10, 4, 1)]]),
            ),
            1,
            area,
            estimateTextWidth,
        );
        const controls = getControlsBox(area);
        expect(hover).toMatchObject({
            placement: 'below',
            name: 'A department with a long name',
        });
        expect(hover?.box.y).toBeCloseTo(265 + 227 + 4, 6);
        expect(hover?.box.x).toBeGreaterThan(controls.x + controls.width);
        expect(hover && boxesIntersect(hover.box, controls)).toBe(false);
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
        hasBacking: false,
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
    it('centres a label drawn inside its circle', () => {
        const [name, detail] = getLabelLines(
            { ...base, placement: 'inside' },
            1,
        );
        expect(name).toMatchObject({ anchor: 'middle', x: 148 });
        expect(detail).toMatchObject({ anchor: 'middle', x: 148 });
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
