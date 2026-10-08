import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { dept, metricsFixture } from '../utils/adoptionFixtures';
import { DepartmentMap } from './DepartmentMap';
import styles from './DepartmentMap.module.css';
import { type PackedCircle } from './geometry';
import { estimateTextWidth, placeLabels } from './mapLayout';
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

const draw = (circle: PackedCircle) => {
    const info = describeCircles(
        [circle],
        new Map([
            [
                circle.id,
                dept(circle.id, null, null, {
                    headcount: 300,
                    effectiveHeadcount: 300,
                    metrics: metricsFixture(200, 67),
                }),
            ],
        ]),
    );
    const { container } = renderWithProviders(
        <DepartmentMap
            width={AREA.width}
            height={AREA.height}
            circles={[circle]}
            info={info}
            dots={[]}
            showNames={false}
            ariaLabel="Map"
            measureText={estimateTextWidth}
            layoutKey="root"
            highlightedUuid={null}
            selectedUserUuid={null}
            onDepartmentClick={vi.fn()}
            onPersonClick={vi.fn()}
        />,
    );
    const [label] = placeLabels([circle], info, 1, AREA, estimateTextWidth);
    return { container, label };
};

describe('DepartmentMap labels', () => {
    it('draws a label that has to sit over people on a light backing 2 px larger all round', () => {
        // The circle fills the panel from top to bottom, so the label can only go inside it
        const { container, label } = draw(circleOfPeople(278));
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
        const { container, label } = draw(circleOfPeople(120));
        expect(label).toMatchObject({ placement: 'below', hasBacking: false });
        expect(
            container.querySelector('[data-label="Service"]'),
        ).not.toBeNull();
        expect(container.querySelector('[data-label-backing]')).toBeNull();
    });
});
