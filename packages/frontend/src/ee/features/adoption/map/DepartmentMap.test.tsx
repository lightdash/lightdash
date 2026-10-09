import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { dept, metricsFixture } from '../utils/adoptionFixtures';
import { DepartmentMap } from './DepartmentMap';
import { type PackedCircle } from './geometry';
import { estimateTextWidth } from './mapLayout';
import { describeCircles } from './mapView';

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
            colourBy="active"
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
