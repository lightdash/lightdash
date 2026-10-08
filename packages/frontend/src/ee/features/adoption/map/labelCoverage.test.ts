import { type DepartmentWithMetrics } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildPackInput, type PackedCircle } from './geometry';
import {
    boxTouchesCircle,
    estimateTextWidth,
    getControlsBox,
    layoutMap,
    placeLabels,
    type Area,
    type Box,
} from './mapLayout';
import { describeCircles } from './mapView';
import { deepOrganization, flatOrganization } from './organizationFixtures';

const WIDTHS = Array.from({ length: 43 }, (_, index) => 360 + index * 20);
const HEIGHT = 560;
// How far a label may sit from its circle
const MAX_LABEL_DISTANCE_PX = 48;

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
    const labels = placeLabels(
        circles,
        describe(circles),
        1,
        area,
        estimateTextWidth,
    );
    return { circles, labels };
};

describe.each([
    ['a deep organization of 56 departments', deepOrganization],
    ['a flat organization of 13 departments', flatOrganization],
])('labels on %s', (_, departments) => {
    it.each(WIDTHS)(
        'name every circle at the focused level of every view at %i px wide',
        (width) => {
            const area = { width, height: HEIGHT };
            const controls = getControlsBox(area);
            getViews(departments).forEach((focus) => {
                const { circles, labels } = drawView(departments, focus, area);
                const byId = new Map(
                    circles.map((circle) => [circle.id, circle]),
                );
                const labelled = new Set(labels.map((label) => label.id));
                expect(
                    circles
                        .filter(
                            (circle) =>
                                circle.depth === 1 && !labelled.has(circle.id),
                        )
                        .map((circle) => `${focus ?? 'top'}: ${circle.name}`),
                ).toEqual([]);
                labels.forEach((label) => {
                    expect(overlaps(label.box, controls)).toBe(false);
                    // Only its own circle, when inside, and the circles it is drawn in may be under it
                    const allowed = new Set<string>();
                    let parentId = byId.get(label.id)?.parentId ?? null;
                    while (parentId !== null && !allowed.has(parentId)) {
                        allowed.add(parentId);
                        parentId = byId.get(parentId)?.parentId ?? null;
                    }
                    if (label.placement === 'inside') allowed.add(label.id);
                    circles
                        .filter((circle) => !allowed.has(circle.id))
                        .forEach((circle) => {
                            expect(
                                boxTouchesCircle(label.box, circle, 1, 0),
                            ).toBe(false);
                        });
                });
                // No label further than the cap from its circle
                expect(
                    labels.flatMap((label) => {
                        const circle = byId.get(label.id);
                        if (!circle || label.placement === 'inside') return [];
                        const distance =
                            label.placement === 'below'
                                ? label.box.y - (circle.y + circle.r)
                                : circle.y -
                                  circle.r -
                                  (label.box.y + label.box.height);
                        return distance > MAX_LABEL_DISTANCE_PX
                            ? [`${focus ?? 'top'}: ${circle.name} ${distance}`]
                            : [];
                    }),
                ).toEqual([]);
            });
        },
    );
});
