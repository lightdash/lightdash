import { describe, expect, it } from 'vitest';
import { dept, metricsFixture } from '../utils/adoptionFixtures';
import { buildPackInput, layoutPack, type PackedCircle } from './geometry';
import {
    getCaptionVariants,
    getLabelLines,
    getPackSize,
    LABEL_BAND,
    placeLabels,
    positionCircles,
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

const tree = [
    { ...d('Ops', null, 300, 90, 40), directMetrics: metricsFixture(0, null) },
    d('Stores', 'Ops', 200, 60, 40),
    d('Depots', 'Ops', 100, 30, 0),
    d('Finance', null, 80, 30, 20),
    d('Customer Operations', null, 60, 41, 33),
    d('Data', null, 9, 9, 9),
];
const byUuid = new Map(tree.map((each) => [each.departmentUuid, each]));

const positioned = (width = 900, height = 560): PackedCircle[] => {
    const size = getPackSize(width, height);
    return positionCircles(
        layoutPack(buildPackInput(tree, null), size),
        width,
        height,
        size,
    );
};

describe('getPackSize', () => {
    it('fits the shorter side and leaves room for labels under the circles', () => {
        expect(getPackSize(900, 560)).toBe(560 - LABEL_BAND);
        expect(getPackSize(400, 560)).toBe(400);
    });
    it('never collapses below a usable size', () => {
        expect(getPackSize(0, 0)).toBe(240);
    });
});

describe('positionCircles', () => {
    const circles = positioned();
    const tops = circles.filter((circle) => circle.depth === 1);

    it('keeps every circle inside the drawing area', () => {
        circles.forEach((circle) => {
            expect(circle.x - circle.r).toBeGreaterThanOrEqual(0);
            expect(circle.x + circle.r).toBeLessThanOrEqual(900);
            expect(circle.y - circle.r).toBeGreaterThanOrEqual(0);
            expect(circle.y + circle.r).toBeLessThanOrEqual(560 - LABEL_BAND);
        });
    });
    it('keeps top-level circles apart', () => {
        tops.forEach((a, index) =>
            tops.slice(index + 1).forEach((b) => {
                expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(
                    a.r + b.r,
                );
            }),
        );
    });
    it('keeps sub-departments inside their parent', () => {
        const ops = circles.find((circle) => circle.id === 'Ops');
        const stores = circles.find((circle) => circle.id === 'Stores');
        expect(ops && stores).toBeTruthy();
        if (!ops || !stores) return;
        expect(
            Math.hypot(ops.x - stores.x, ops.y - stores.y) + stores.r,
        ).toBeLessThanOrEqual(ops.r);
    });
    it('keeps relative areas, so the picture stays to scale', () => {
        const size = getPackSize(900, 560);
        const raw = layoutPack(buildPackInput(tree, null), size);
        const ratio = (list: PackedCircle[]) =>
            (list.find((circle) => circle.id === 'Finance')?.r ?? 0) /
            (list.find((circle) => circle.id === 'Ops')?.r ?? 1);
        expect(ratio(circles)).toBeCloseTo(ratio(raw), 6);
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

const AREA = { width: 900, height: 560 };

describe('placeLabels', () => {
    const circles = positioned();
    const info = describeCircles(circles, byUuid);
    const labels = placeLabels(circles, info, 1, AREA);
    const find = (id: string) => labels.find((label) => label.id === id);

    it('puts the name and one line of numbers under each top-level circle', () => {
        const ops = find('Ops');
        const circle = circles.find((each) => each.id === 'Ops');
        expect(ops?.placement).toBe('below');
        expect(ops?.name).toBe('Ops');
        expect(ops?.detail).toBe('90 of 300 on Lightdash · 40 active');
        expect(ops?.y).toBeCloseTo((circle?.y ?? 0) + (circle?.r ?? 0), 6);
    });
    it('labels sub-departments above their circle with a people count', () => {
        expect(find('Stores')?.placement).toBe('above');
        expect(find('Stores')?.name).toBe('Stores · 200');
        expect(find('Stores')?.detail).toBeNull();
    });
    it('never lets two labels overlap', () => {
        const boxes = labels.map((label) => label.box);
        boxes.forEach((a, index) =>
            boxes.slice(index + 1).forEach((b) => {
                const apart =
                    a.x + a.width <= b.x ||
                    b.x + b.width <= a.x ||
                    a.y + a.height <= b.y ||
                    b.y + b.height <= a.y;
                expect(apart).toBe(true);
            }),
        );
    });
    it('shortens or drops labels on a crowded map instead of overlapping', () => {
        const crowd = Array.from({ length: 40 }, (_, index) =>
            d(`Department number ${index}`, null, 10, 5, 2),
        );
        const size = getPackSize(500, 400);
        const crowded = positionCircles(
            layoutPack(buildPackInput(crowd, null), size),
            500,
            400,
            size,
        );
        const placed = placeLabels(
            crowded,
            describeCircles(
                crowded,
                new Map(crowd.map((each) => [each.departmentUuid, each])),
            ),
            1,
            { width: 500, height: 400 },
        );
        expect(placed.length).toBeLessThan(crowded.length);
        // No label lands on top of another department's small circle
        placed.forEach((label) =>
            crowded
                .filter((circle) => circle.id !== label.id)
                .forEach((circle) => {
                    const covers =
                        label.box.x < circle.x + circle.r * 0.6 &&
                        circle.x - circle.r * 0.6 <
                            label.box.x + label.box.width &&
                        label.box.y < circle.y + circle.r * 0.6 &&
                        circle.y - circle.r * 0.6 <
                            label.box.y + label.box.height;
                    expect(covers).toBe(false);
                }),
        );
        placed.forEach((label) => {
            expect(label.box.x).toBeGreaterThanOrEqual(0);
            expect(label.box.x + label.box.width).toBeLessThanOrEqual(500);
            expect(label.box.y + label.box.height).toBeLessThanOrEqual(400);
        });
        placed.forEach((a, index) =>
            placed.slice(index + 1).forEach((b) => {
                const apart =
                    a.box.x + a.box.width <= b.box.x ||
                    b.box.x + b.box.width <= a.box.x ||
                    a.box.y + a.box.height <= b.box.y ||
                    b.box.y + b.box.height <= a.box.y;
                expect(apart).toBe(true);
            }),
        );
    });
    it('gives labels more room as the map is zoomed in', () => {
        const zoomed = placeLabels(circles, info, 4, AREA);
        const before = find('Customer Operations')?.name.length ?? 0;
        const after =
            zoomed.find((label) => label.id === 'Customer Operations')?.name
                .length ?? 0;
        expect(after).toBeGreaterThanOrEqual(before);
        expect(after).toBe('Customer Operations'.length);
    });
    it('moves a label beside its circle when there is no room underneath', () => {
        const lopsided = [
            d('Retail', null, 3000, 400, 180),
            d('Product', null, 14, 14, 11),
            d('Finance', null, 32, 3, 1),
            d('Marketing', null, 40, 12, 8),
            d('Supply', null, 80, 0, 0),
        ];
        const size = getPackSize(780, 560);
        const packed = positionCircles(
            layoutPack(buildPackInput(lopsided, null), size),
            780,
            560,
            size,
        );
        const placed = placeLabels(
            packed,
            describeCircles(
                packed,
                new Map(lopsided.map((each) => [each.departmentUuid, each])),
            ),
            1,
            { width: 780, height: 560 },
        );
        expect(placed.find((label) => label.id === 'Retail')?.placement).toBe(
            'below',
        );
        expect(
            placed.some(
                (label) =>
                    label.placement === 'right' || label.placement === 'left',
            ),
        ).toBe(true);
    });
});

describe('getLabelLines', () => {
    const base = {
        id: 'x',
        x: 100,
        y: 200,
        name: 'Finance',
        box: { x: 0, y: 0, width: 0, height: 0 },
    };
    it('hangs two centred lines under the circle', () => {
        expect(
            getLabelLines(
                { ...base, placement: 'below', detail: '3 of 32' },
                1,
            ),
        ).toEqual([
            { role: 'name', text: 'Finance', x: 100, y: 216, anchor: 'middle' },
            {
                role: 'detail',
                text: '3 of 32',
                x: 100,
                y: 231,
                anchor: 'middle',
            },
        ]);
    });
    it('reads away from the circle when placed beside it', () => {
        const [right] = getLabelLines(
            { ...base, placement: 'right', detail: null },
            1,
        );
        const [left] = getLabelLines(
            { ...base, placement: 'left', detail: null },
            1,
        );
        expect(right.anchor).toBe('start');
        expect(right.x).toBeGreaterThan(100);
        expect(left.anchor).toBe('end');
        expect(left.x).toBeLessThan(100);
    });
    it('keeps the same distance on screen when zoomed in', () => {
        const [name] = getLabelLines(
            { ...base, placement: 'below', detail: null },
            4,
        );
        expect(name.y).toBe(204);
    });
    it('draws a sub-department label as one line above its circle', () => {
        expect(
            getLabelLines(
                {
                    ...base,
                    placement: 'above',
                    name: 'Stores · 200',
                    detail: null,
                },
                1,
            ),
        ).toEqual([
            {
                role: 'nested',
                text: 'Stores · 200',
                x: 100,
                y: 194,
                anchor: 'middle',
            },
        ]);
    });
});
