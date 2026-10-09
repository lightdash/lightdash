import { type DepartmentWithMetrics } from '@lightdash/common';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { DepartmentMap } from './DepartmentMap';
import { buildPackInput } from './geometry';
import {
    estimateTextWidth,
    getControlsBox,
    getHoverLabel,
    getRestLabels,
    layoutMap,
    type Area,
    type Box,
} from './mapLayout';
import { describeCircles } from './mapView';
import { deepOrganization, flatOrganization } from './organizationFixtures';

const WIDTHS = Array.from({ length: 43 }, (_, index) => 360 + index * 20);
const HEIGHT = 560;

const overlaps = (a: Box, b: Box): boolean =>
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;

// The organization, then every department the map can open: onto its sub-departments, or on its own as
// one circle as tall as the drawing, whose label has only the band under it
const getViews = (departments: DepartmentWithMetrics[]): (string | null)[] => [
    null,
    ...departments.map((department) => department.departmentUuid),
];

const drawView = (
    departments: DepartmentWithMetrics[],
    focus: string | null,
    area: Area,
) => {
    const byUuid = new Map(
        departments.map((department) => [
            department.departmentUuid,
            department,
        ]),
    );
    const circles = layoutMap({
        input: buildPackInput(departments, focus),
        area,
        focusName: focus === null ? null : (byUuid.get(focus)?.name ?? null),
    });
    return { circles, info: describeCircles(circles, byUuid) };
};

describe.each([
    ['a deep organization of 56 departments', deepOrganization],
    ['a flat organization of 13 departments', flatOrganization],
])('labels on %s', (_, departments) => {
    it.each(WIDTHS)(
        'name every circle at the focused level of every view, whole with its numbers, inside the panel and off the zoom buttons, at rest and on hover, at %i px wide',
        (width) => {
            const area = { width, height: HEIGHT };
            const controls = getControlsBox(area);
            getViews(departments).forEach((focus) => {
                const { circles, info } = drawView(departments, focus, area);
                const view = focus ?? 'top';
                // Each name in full with a line of numbers, inside the panel and off the zoom buttons
                expect(
                    circles
                        .filter((circle) => circle.depth === 1)
                        .flatMap((circle) => {
                            const label = getHoverLabel(
                                circle,
                                info,
                                1,
                                area,
                                estimateTextWidth,
                            );
                            const isWhole =
                                label !== null &&
                                label.name === circle.name &&
                                label.detail !== null &&
                                label.detail.length > 0 &&
                                label.box.x >= 0 &&
                                label.box.y >= 0 &&
                                label.box.x + label.box.width <= width &&
                                label.box.y + label.box.height <= HEIGHT &&
                                !overlaps(label.box, controls);
                            return isWhole ? [] : [`${view}: ${circle.name}`];
                        }),
                ).toEqual([]);
            });
            // At rest the organization's level is named with the shortest lines, placed as above, no two names
            // overlapping, and nothing else is drawn
            const { circles, info } = drawView(departments, null, area);
            const { container, unmount } = renderWithProviders(
                <DepartmentMap
                    width={width}
                    height={HEIGHT}
                    circles={circles}
                    info={info}
                    dots={[]}
                    colourBy="activity"
                    showNames={false}
                    ariaLabel="Map"
                    measureText={estimateTextWidth}
                    layoutKey="top"
                    highlightedUuid={null}
                    selectedUserUuid={null}
                    onDepartmentClick={vi.fn()}
                    onPersonClick={vi.fn()}
                />,
            );
            expect(container.querySelectorAll('[data-circle]').length).toBe(
                circles.length,
            );
            const named = getRestLabels(
                circles,
                info,
                1,
                area,
                estimateTextWidth,
            );
            expect(
                named.map((label) =>
                    [
                        ...container.querySelectorAll(
                            `[data-rest-label="${label.id}"]`,
                        ),
                    ].map((node) => node.textContent),
                ),
            ).toEqual(named.map((label) => [label.name, label.detail]));
            named.forEach((label, index) => {
                expect(label.box.x).toBeGreaterThanOrEqual(0);
                expect(label.box.y).toBeGreaterThanOrEqual(0);
                expect(label.box.x + label.box.width).toBeLessThanOrEqual(
                    width,
                );
                expect(label.box.y + label.box.height).toBeLessThanOrEqual(
                    HEIGHT,
                );
                expect(overlaps(label.box, controls)).toBe(false);
                named
                    .slice(index + 1)
                    .forEach((other) =>
                        expect(overlaps(label.box, other.box)).toBe(false),
                    );
            });
            expect(container.querySelectorAll('svg text')).toHaveLength(
                named.length * 2,
            );
            expect(container.querySelector('[data-label]')).toBeNull();
            unmount();
        },
    );
});

const drawMap = (departments: DepartmentWithMetrics[], area: Area) => {
    const { circles, info } = drawView(departments, null, area);
    const { container } = renderWithProviders(
        <DepartmentMap
            width={area.width}
            height={area.height}
            circles={circles}
            info={info}
            dots={[]}
            colourBy="activity"
            showNames={false}
            ariaLabel="Map"
            measureText={estimateTextWidth}
            layoutKey="top"
            highlightedUuid={null}
            selectedUserUuid={null}
            onDepartmentClick={vi.fn()}
            onPersonClick={vi.fn()}
        />,
    );
    return { circles, container };
};

describe('names at rest that would overlap', () => {
    it.each([
        [
            'the deep organization at 480 px',
            deepOrganization,
            480,
            [
                'Commercial',
                'Executive Office',
                'Finance',
                'Legal & Compliance',
                'Operations',
                'People',
            ],
            ['Data & Analytics', 'Product & Engineering'],
        ],
        [
            'the flat organization at 400 px',
            flatOrganization,
            400,
            [
                'Customer Service',
                'Data & Analytics',
                'Engineering',
                'Marketing',
                'Operations',
                'Partners',
                'Product',
            ],
            ['Finance', 'Sales'],
        ],
    ])(
        "leave the smaller circle's name for hover on %s",
        (_, departments, width, named, left) => {
            const { circles, container } = drawMap(departments, {
                width,
                height: HEIGHT,
            });
            const drawn = new Set(
                [...container.querySelectorAll('[data-rest-label]')].map(
                    (node) => node.getAttribute('data-rest-label') ?? '',
                ),
            );
            expect([...drawn].sort()).toEqual([...named].sort());
            const radiusOf = (id: string) =>
                circles.find((circle) => circle.id === id)?.r ?? 0;
            left.forEach((id) => {
                // Smaller than a circle that keeps its name, and still named on hover
                expect(
                    named.some((other) => radiusOf(other) > radiusOf(id)),
                ).toBe(true);
                const circle = container.querySelector(`[data-circle="${id}"]`);
                expect(circle).not.toBeNull();
                if (!circle) return;
                fireEvent.pointerOver(circle);
                expect(
                    container.querySelector(`[data-label="${id}"]`)
                        ?.textContent,
                ).toBe(id);
                fireEvent.pointerOut(circle, { relatedTarget: null });
            });
        },
    );
});
