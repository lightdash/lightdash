import { type DepartmentWithMetrics } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { DepartmentMap } from './DepartmentMap';
import { buildPackInput, type PackedCircle } from './geometry';
import {
    estimateTextWidth,
    getControlsBox,
    getHoverLabel,
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

// The organization, then every department the map can open onto sub-departments
const getViews = (departments: DepartmentWithMetrics[]): (string | null)[] => [
    null,
    ...departments
        .filter((department) =>
            departments.some(
                (child) =>
                    child.parentDepartmentUuid === department.departmentUuid,
            ),
        )
        .map((department) => department.departmentUuid),
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
    const describe = (circles: PackedCircle[]) =>
        describeCircles(circles, byUuid);
    const circles = layoutMap({
        input: buildPackInput(departments, focus),
        area,
        focusName: focus === null ? null : (byUuid.get(focus)?.name ?? null),
        describe,
        measure: estimateTextWidth,
    });
    return { circles, info: describe(circles) };
};

describe.each([
    ['a deep organization of 56 departments', deepOrganization],
    ['a flat organization of 13 departments', flatOrganization],
])('labels on %s', (_, departments) => {
    it.each(WIDTHS)(
        'name every circle at the focused level of every view on hover, with its numbers, and draw no label at rest at %i px wide',
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
                const { container, unmount } = renderWithProviders(
                    <DepartmentMap
                        width={width}
                        height={HEIGHT}
                        circles={circles}
                        info={info}
                        dots={[]}
                        showNames={false}
                        ariaLabel="Map"
                        measureText={estimateTextWidth}
                        layoutKey={view}
                        highlightedUuid={null}
                        selectedUserUuid={null}
                        onDepartmentClick={vi.fn()}
                        onPersonClick={vi.fn()}
                    />,
                );
                expect(container.querySelectorAll('[data-circle]').length).toBe(
                    circles.length,
                );
                expect(
                    container.querySelectorAll(
                        '[data-label], [data-label-backing], svg text',
                    ),
                ).toHaveLength(0);
                unmount();
            });
        },
    );
});
