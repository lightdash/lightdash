import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { dept, metricsFixture } from '../utils/adoptionFixtures';
import { DepartmentMap } from './DepartmentMap';
import styles from './DepartmentMap.module.css';
import { type PackedCircle } from './geometry';
import { estimateTextWidth, LABELS_AT_REST, placeLabels } from './mapLayout';
import { describeCircles } from './mapView';

const AREA = { width: 760, height: 560 };

// More than 150 people, so first names are not drawn and a label may go over the dots
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
) => {
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
            dots={[]}
            showNames={false}
            ariaLabel="Map"
            measureText={estimateTextWidth}
            layoutKey="root"
            highlightedUuid={highlightedUuid}
            selectedUserUuid={null}
            onDepartmentClick={vi.fn()}
            onPersonClick={vi.fn()}
        />,
    );
    const textOf = (id: string) =>
        [...container.querySelectorAll(`[data-label="${id}"]`)].map(
            (node) => node.textContent,
        );
    return { container, info, textOf };
};

describe('DepartmentMap labels', () => {
    it('draws no label at rest, and a name with its numbers while its circle is hovered', () => {
        const { container, textOf } = draw([circleOfPeople(120)]);
        expect(container.querySelector('[data-label]')).toBeNull();
        expect(container.querySelector('[data-label-backing]')).toBeNull();
        expect(container.querySelectorAll('svg text')).toHaveLength(0);
        const circle = container.querySelector('[data-circle="Service"]');
        if (circle) fireEvent.pointerOver(circle);
        expect(textOf('Service')).toEqual(['Service', '200 of 300']);
        if (circle) fireEvent.pointerOut(circle, { relatedTarget: null });
        expect(container.querySelector('[data-label]')).toBeNull();
    });
    it("shows a department's label while its control has keyboard focus", () => {
        const { textOf } = draw([circleOfPeople(120)], 'Service');
        expect(textOf('Service')).toEqual(['Service', '200 of 300']);
    });
    it('names the people directly in a department after the department around them', () => {
        const ops: PackedCircle = {
            ...circleOfPeople(200),
            id: 'Ops',
            departmentUuid: 'Ops',
            name: 'Ops',
            size: 40,
            people: null,
            childDepartmentCount: 1,
        };
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
        const { container, textOf } = draw([ops, direct]);
        const people = container.querySelector('[data-circle="own:Ops"]');
        if (people) fireEvent.pointerOver(people);
        expect(textOf('Ops')).toEqual(['Ops', '12 of 40']);
        expect(container.querySelector('[data-label="own:Ops"]')).toBeNull();
    });
});

// Labels at rest are off; these keep their drawing covered for when they are turned back on
describe.skipIf(!LABELS_AT_REST)('DepartmentMap labels at rest', () => {
    const drawAtRest = (r: number) => {
        const circle = circleOfPeople(r);
        const { container, info } = draw([circle]);
        const [label] = placeLabels([circle], info, 1, AREA, estimateTextWidth);
        return { container, label };
    };

    it('draws a label that has to sit over people on a light backing 2 px larger all round', () => {
        // The circle fills the panel from top to bottom, so the label can only go inside it
        const { container, label } = drawAtRest(278);
        expect(label.hasBacking).toBe(true);
        const backing = container.querySelector(
            '[data-label-backing="Service"]',
        );
        expect(backing).not.toBeNull();
        expect(backing).toHaveClass(styles.labelBacking);
        expect(Number(backing?.getAttribute('x'))).toBeCloseTo(
            label.box.x - 2,
            6,
        );
        expect(Number(backing?.getAttribute('y'))).toBeCloseTo(
            label.box.y - 2,
            6,
        );
        expect(Number(backing?.getAttribute('width'))).toBeCloseTo(
            label.box.width + 4,
            6,
        );
        expect(Number(backing?.getAttribute('height'))).toBeCloseTo(
            label.box.height + 4,
            6,
        );
        // The same fill as its circle, and drawn under the text
        const circle = container.querySelector('[data-circle="Service"]');
        ['data-nested', 'data-empty', 'data-no-headcount'].forEach((name) =>
            expect(backing?.getAttribute(name)).toBe(
                circle?.getAttribute(name),
            ),
        );
        const text = container.querySelector('text[data-label="Service"]');
        expect(text).not.toBeNull();
        if (backing && text) {
            expect(
                backing.compareDocumentPosition(text) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
        }
    });
    it('draws a label under its circle with no backing', () => {
        const { container, label } = drawAtRest(120);
        expect(label).toMatchObject({ placement: 'below', hasBacking: false });
        expect(
            container.querySelector('[data-label="Service"]'),
        ).not.toBeNull();
        expect(container.querySelector('[data-label-backing]')).toBeNull();
    });
});
