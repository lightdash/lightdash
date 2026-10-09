import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { dept, memberFixture, metricsFixture } from '../utils/adoptionFixtures';
import { DepartmentMap } from './DepartmentMap';
import styles from './DepartmentMap.module.css';
import { type PackedCircle } from './geometry';
import { estimateTextWidth, TEXT_FONTS } from './mapLayout';
import { describeCircles, type MapDot } from './mapView';

const AREA = { width: 760, height: 560 };

// More than 150 people, so first names are not drawn
const circleOfPeople = (r: number): PackedCircle => ({
    id: 'Service',
    kind: 'department',
    departmentUuid: 'Service',
    name: 'Service',
    hasHeadcount: true,
    hasMembers: true,
    childDepartmentCount: 0,
    size: 300,
    people: { metrics: metricsFixture(200, null), headcount: 300 },
    depth: 1,
    parentId: null,
    x: 380,
    y: 280,
    r,
    isAreaHonest: true,
});

const SERVICE = dept('Service', null, null, {
    headcount: 300,
    effectiveHeadcount: 300,
    metrics: metricsFixture(200, 67, { activeCount30d: 120 }),
});

const draw = (
    circles: PackedCircle[],
    highlightedUuid: string | null = null,
    dots: MapDot[] = [],
) => {
    const onPersonClick = vi.fn();
    const info = describeCircles(
        circles,
        new Map([
            [SERVICE.departmentUuid, SERVICE],
            [
                'Ops',
                dept('Ops', null, null, {
                    headcount: 40,
                    effectiveHeadcount: 40,
                    metrics: metricsFixture(12, 30, { activeCount30d: 5 }),
                }),
            ],
        ]),
    );
    const { container } = renderWithProviders(
        <DepartmentMap
            width={AREA.width}
            height={AREA.height}
            circles={circles}
            info={info}
            dots={dots}
            colourBy="activity"
            ariaLabel="Map"
            measureText={estimateTextWidth}
            layoutKey="root"
            highlightedUuid={highlightedUuid}
            selectedUserUuid={null}
            onDepartmentClick={vi.fn()}
            onPersonClick={onPersonClick}
        />,
    );
    const textOf = (id: string) =>
        [...container.querySelectorAll(`[data-label="${id}"]`)].map(
            (node) => node.textContent,
        );
    const restTextOf = (id: string) =>
        [...container.querySelectorAll(`[data-rest-label="${id}"]`)].map(
            (node) => node.textContent,
        );
    // Where each line of a circle's name at rest sits, by its baseline
    const restBaselinesOf = (id: string) =>
        [...container.querySelectorAll(`[data-rest-label="${id}"]`)].map(
            (node) => Number(node.getAttribute('y')),
        );
    const hover = (id: string) => {
        const circle = container.querySelector(`[data-circle="${id}"]`);
        expect(circle).not.toBeNull();
        if (circle) fireEvent.pointerOver(circle);
    };
    const leave = (id: string) => {
        const circle = container.querySelector(`[data-circle="${id}"]`);
        if (circle) fireEvent.pointerOut(circle, { relatedTarget: null });
    };
    return {
        container,
        info,
        textOf,
        restTextOf,
        restBaselinesOf,
        hover,
        leave,
        onPersonClick,
    };
};

const OPS = {
    id: 'Ops',
    departmentUuid: 'Ops',
    name: 'Ops',
    size: 40,
    people: null,
    childDepartmentCount: 1,
} satisfies Partial<PackedCircle>;

describe('DepartmentMap labels', () => {
    it('names a circle of the level in view at rest, in bold over its numbers, and swaps that name for its hover label while it is hovered', () => {
        const { container, textOf, restTextOf, hover, leave } = draw([
            circleOfPeople(120),
        ]);
        expect(restTextOf('Service')).toEqual(['Service', '200 of 300']);
        const [name, numbers] = container.querySelectorAll(
            '[data-rest-label="Service"]',
        );
        // The hover label's styles, which keep it off the pointer and ringed to read over other circles
        expect(name).toHaveClass(styles.label, styles.labelName);
        expect(numbers).toHaveClass(styles.label, styles.labelDetail);
        // Centred under the circle, which ends at 400, and drawn after the circles so it sits over them
        expect(Number(name.getAttribute('x'))).toBeCloseTo(380, 6);
        expect(Number(name.getAttribute('y'))).toBeGreaterThan(400);
        expect(
            container
                .querySelector('[data-circle="Service"]')
                ?.compareDocumentPosition(name),
        ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        expect(container.querySelector('[data-label]')).toBeNull();

        hover('Service');
        // The fuller line, so hovering adds to the name at rest; never both at once
        expect(textOf('Service')).toEqual([
            'Service',
            '200 of 300 on Lightdash · 120 active',
        ]);
        expect(restTextOf('Service')).toEqual([]);
        leave('Service');
        expect(container.querySelector('[data-label]')).toBeNull();
        expect(restTextOf('Service')).toEqual(['Service', '200 of 300']);
    });
    it("swaps a department's name at rest for its hover label while its control has keyboard focus", () => {
        const { textOf, restTextOf } = draw([circleOfPeople(120)], 'Service');
        expect(textOf('Service')).toEqual([
            'Service',
            '200 of 300 on Lightdash · 120 active',
        ]);
        expect(restTextOf('Service')).toEqual([]);
    });
    it('names the people directly in a department after the department around them, and no circle inside another at rest', () => {
        const ops: PackedCircle = { ...circleOfPeople(200), ...OPS };
        const direct: PackedCircle = {
            ...circleOfPeople(60),
            id: 'own:Ops',
            kind: 'direct',
            departmentUuid: 'Ops',
            name: 'Directly in Ops',
            size: 4,
            people: { metrics: metricsFixture(4, null), headcount: null },
            depth: 2,
            parentId: 'Ops',
        };
        const { container, textOf, restTextOf, hover } = draw([ops, direct]);
        expect(restTextOf('Ops')).toEqual(['Ops', '12 of 40']);
        expect(
            container.querySelector('[data-rest-label="own:Ops"]'),
        ).toBeNull();
        hover('own:Ops');
        expect(textOf('Ops')).toEqual([
            'Ops',
            '12 of 40 on Lightdash · 5 active · 1 sub-department',
        ]);
        expect(restTextOf('Ops')).toEqual([]);
        expect(container.querySelector('[data-label="own:Ops"]')).toBeNull();
    });
    it('moves the name at rest of a circle at the foot of the map over the circle, where under it would leave the map', () => {
        // Its name under it would end 34 px below its foot at 550, past the inset from the map's edge at 560
        const low: PackedCircle = { ...circleOfPeople(50), y: 500 };
        const high: PackedCircle = {
            ...circleOfPeople(50),
            ...OPS,
            x: 600,
            y: 150,
        };
        const { restBaselinesOf } = draw([low, high]);
        expect(restBaselinesOf('Service')).toHaveLength(2);
        restBaselinesOf('Service').forEach((baseline) =>
            expect(baseline).toBeLessThan(450),
        );
        restBaselinesOf('Ops').forEach((baseline) =>
            expect(baseline).toBeGreaterThan(200),
        );
    });
    it('names a circle at rest only while it is at least 24 px across on screen, and on hover at any size', () => {
        // 22 px across
        const { container, textOf, restTextOf, hover, leave } = draw([
            circleOfPeople(11),
        ]);
        expect(restTextOf('Service')).toEqual([]);
        hover('Service');
        expect(textOf('Service')).toEqual([
            'Service',
            '200 of 300 on Lightdash · 120 active',
        ]);
        leave('Service');
        // 35 px across once zoomed in; the name keeps its size on screen
        fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
        expect(restTextOf('Service')).toEqual(['Service', '200 of 300']);
        expect(
            container.querySelector('[data-rest-label="Service"]'),
        ).toHaveAttribute('font-size', String(TEXT_FONTS.name.size / 1.6));
    });
});

describe('DepartmentMap dots', () => {
    const dot = (key: string, x: number, isShared: boolean): MapDot => ({
        key,
        circleId: 'Service',
        x,
        y: 280,
        r: 5,
        kind: 'healthy',
        member: null,
        isShared,
    });

    it('rings the dot of a person who counts in another department, inside the room the dot has', () => {
        const { container } = draw([circleOfPeople(120)], null, [
            dot('a', 370, true),
            dot('b', 390, false),
        ]);
        const rings = [...container.querySelectorAll(`.${styles.shared}`)];
        expect(rings).toHaveLength(1);
        const [ring] = rings;
        // Drawn from counts, nobody is behind the dot, so its ring takes no presses
        expect(ring).not.toHaveAttribute('data-ring-user');
        const ringRadius = Number(ring.getAttribute('r'));
        const ringWidth = Number(ring.getAttribute('stroke-width'));
        expect(ring).toHaveAttribute('cx', '370');
        expect(ringWidth).toBe(1);
        // The ring's outer edge is the dot's own edge, so it never reaches a neighbour
        expect(ringRadius + ringWidth / 2).toBeCloseTo(5, 9);
        // How far a dot reaches, its edge included
        const footprint = (circle: Element | null) =>
            Number(circle?.getAttribute('r')) +
            Number(circle?.getAttribute('stroke-width') ?? 0) / 2;
        const ringed = container.querySelector('[data-dot][data-shared]');
        expect(ringed).toHaveAttribute('cx', '370');
        expect(footprint(ringed)).toBeLessThan(ringRadius - ringWidth / 2);
        // Every dot is still one circle in the dots layer, ringed or not, and one without a ring fills its room
        expect(container.querySelectorAll('[data-dot]')).toHaveLength(2);
        expect(
            footprint(container.querySelector('[data-dot]:not([data-shared])')),
        ).toBe(5);
    });
    it("keeps a loaded person's whole room selectable: a press on their ring selects them, and their dot sits above it", () => {
        const { container, onPersonClick } = draw([circleOfPeople(120)], null, [
            { ...dot('a', 370, true), member: memberFixture('sam', null) },
        ]);
        const ring = container.querySelector(`.${styles.shared}`);
        const ringed = container.querySelector('[data-dot][data-shared]');
        expect(ring).toHaveAttribute('data-ring-user', 'sam');
        expect(ringed).not.toBeNull();
        // Drawn after its ring, so a press on the dot itself still reaches the dot
        expect(
            ring && ringed
                ? ring.compareDocumentPosition(ringed) &
                      Node.DOCUMENT_POSITION_FOLLOWING
                : 0,
        ).toBeTruthy();
        if (ring) fireEvent.click(ring);
        expect(onPersonClick).toHaveBeenCalledWith('sam');
    });
    it('sizes a dot and its ring from one room, so a smaller dot without an account keeps its ring at its edge', () => {
        const { container } = draw([circleOfPeople(120)], null, [
            { ...dot('a', 370, true), kind: 'noAccount' },
        ]);
        const ring = container.querySelector(`.${styles.shared}`);
        const ringRadius = Number(ring?.getAttribute('r'));
        const ringWidth = Number(ring?.getAttribute('stroke-width'));
        // A dot without an account has 0.78 of the room a dot of 5 px has, and its ring sits at that edge
        expect(ringRadius + ringWidth / 2).toBeCloseTo(5 * 0.78, 9);
        expect(
            Number(
                container
                    .querySelector('[data-dot][data-shared]')
                    ?.getAttribute('r'),
            ),
        ).toBeLessThan(ringRadius - ringWidth / 2);
    });
    it('draws no rings when nobody counts in another department', () => {
        const { container } = draw([circleOfPeople(120)], null, [
            dot('a', 370, false),
        ]);
        expect(container.querySelector(`.${styles.shared}`)).toBeNull();
        expect(container.querySelector('[data-shared]')).toBeNull();
    });
});
