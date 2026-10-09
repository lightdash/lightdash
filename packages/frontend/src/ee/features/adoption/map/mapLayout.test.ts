import { type DepartmentWithMetrics } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
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
    estimateTextWidth,
    fitToArea,
    getCaptionVariants,
    getControlsBox,
    getHoverLabel,
    getRestLabels,
    getTopLevelGroups,
    getLabelLines,
    layoutMap,
    makeWayForHoverLabel,
    type Area,
    type Box,
    type CircleLabel,
} from './mapLayout';
import { describeCircles, nameLoneBucket } from './mapView';
import { deepOrganization } from './organizationFixtures';

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
) => {
    const circles = layoutMap({
        input: buildPackInput(departments, focus),
        area,
        focusName: focus,
    });
    const find = (id: string) => {
        const circle = circles.find((each) => each.id === id);
        if (!circle) throw new Error(`No circle ${id}`);
        return circle;
    };
    return { circles, find };
};

const contains = (outer: PackedCircle, inner: PackedCircle): boolean =>
    outer.depth < inner.depth &&
    Math.hypot(outer.x - inner.x, outer.y - inner.y) + inner.r <= outer.r + 0.5;

const boxesIntersect = (a: Box, b: Box): boolean =>
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;

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
    it('fills the panel with the pack, less a band at the bottom that fits one hover label', () => {
        // One department fills the height: 12 px above it, and below it a hover label of two lines
        const area = { width: 760, height: 560 };
        const [only] = build([d('Only', null, 12, 4, 1)], area).circles;
        expect(only.y - only.r).toBeCloseTo(12, 6);
        expect(only.y + only.r).toBeCloseTo(560 - 40, 6);
        const hover = getHoverLabel(
            only,
            describeCircles(
                [only],
                new Map([['Only', d('Only', null, 12, 4, 1)]]),
            ),
            1,
            area,
            estimateTextWidth,
        );
        expect(hover).toMatchObject({ placement: 'below' });
        expect((hover?.box.y ?? 0) + (hover?.box.height ?? 0)).toBeCloseTo(
            560 - 6,
            6,
        );
    });
    it('names the lone circle of a department without sub-departments after the department', () => {
        const lone = buildPackInput(seededOrganization(), 'Finance');
        expect(
            layoutMap({ input: lone, area: PANEL, focusName: 'Finance' }),
        ).toEqual(nameLoneBucket(fitToArea(lone, PANEL), 'Finance'));
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

describe('getRestLabels', () => {
    const departments = [
        d('Ops', null, 30, 9, 4, 0),
        d('Stores', 'Ops', 20, 6, 4),
        d('Depots', 'Ops', 10, 3, 0),
        d('Finance', null, 8, 3, 2),
    ];
    const { circles, find } = build(departments);
    const info = describeCircles(
        circles,
        new Map(departments.map((each) => [each.departmentUuid, each])),
    );

    it('names each circle of the level in view as and where its hover label names it, and none inside them', () => {
        const labels = getRestLabels(
            circles,
            info,
            1,
            PANEL,
            estimateTextWidth,
        );
        expect(labels.map((label) => label.id).sort()).toEqual([
            'Finance',
            'Ops',
        ]);
        labels.forEach((label) =>
            expect(label).toEqual(
                getHoverLabel(
                    find(label.id),
                    info,
                    1,
                    PANEL,
                    estimateTextWidth,
                ),
            ),
        );
    });
    it('names a circle at rest only while it is at least 24 px across on screen', () => {
        const small = { ...find('Finance'), r: 11.9 };
        expect(
            getRestLabels([small], info, 1, PANEL, estimateTextWidth),
        ).toEqual([]);
        expect(
            getRestLabels([small], info, 2, PANEL, estimateTextWidth).map(
                (label) => label.id,
            ),
        ).toEqual(['Finance']);
    });
});

describe('makeWayForHoverLabel', () => {
    const at = (id: string, x: number): CircleLabel => ({
        id,
        placement: 'below',
        isNested: false,
        name: id,
        detail: null,
        box: { x, y: 100, width: 60, height: 16 },
    });
    const labels = [at('A', 100), at('B', 150), at('C', 400)];

    it("drops the hovered circle's name at rest and any other name the hover label would sit on", () => {
        expect(makeWayForHoverLabel(labels, at('A', 100))).toEqual([
            at('C', 400),
        ]);
        // A sub-department's hover label sits on no name at rest here
        expect(makeWayForHoverLabel(labels, at('Nested', 260))).toEqual(labels);
    });
    it('keeps every name at rest while nothing is hovered', () => {
        expect(makeWayForHoverLabel(labels, undefined)).toBe(labels);
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
