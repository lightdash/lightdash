import {
    getChildrenMap,
    type AdoptionMetrics,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import {
    getDotSegments,
    type ColourBy,
    type DotKind,
    type DotSegment,
} from '../map/geometry';
import { LEGEND_KINDS } from '../map/mapStyles';
import { getDirectHeadcount } from './headcount';

// Everyone counted, in the parts the map colours them by, the people without an account last; the parts add up
// to the effective headcount. The panel's bars and legend and the legend under the map all read it
export type PeopleBreakdown = DotSegment[];

export const getPeopleBreakdown = (
    metrics: AdoptionMetrics,
    effectiveHeadcount: number,
    colourBy: ColourBy,
): PeopleBreakdown =>
    getDotSegments({ metrics, headcount: effectiveHeadcount }, colourBy);

export const getDepartmentBreakdown = (
    department: DepartmentWithMetrics,
    colourBy: ColourBy,
): PeopleBreakdown =>
    getPeopleBreakdown(
        department.metrics,
        department.effectiveHeadcount,
        colourBy,
    );

// Everyone placed in a department: the top-level departments added up. The summary's organization
// numbers are not used, as they count everyone on Lightdash, placed or not
export const getOrganizationBreakdown = (
    departments: DepartmentWithMetrics[],
    colourBy: ColourBy,
): PeopleBreakdown => {
    const topLevel = new Set(getChildrenMap(departments).get(null));
    const totals = new Map<DotKind, number>();
    departments.forEach((department) => {
        if (!topLevel.has(department.departmentUuid)) return;
        getDepartmentBreakdown(department, colourBy).forEach(
            ({ kind, count }) =>
                totals.set(kind, (totals.get(kind) ?? 0) + count),
        );
    });
    return LEGEND_KINDS[colourBy].map((kind) => ({
        kind,
        count: totals.get(kind) ?? 0,
    }));
};

const getShare = (part: number, whole: number): number =>
    whole > 0 ? part / whole : 0;

// What a row gives in its last column: its coverage, a request for a headcount, or that nobody is counted
export type CoverageReading =
    | { kind: 'coverage'; pct: number }
    | { kind: 'noHeadcount' }
    | { kind: 'nobody' };

export type CoverageRow = {
    department: DepartmentWithMetrics;
    breakdown: PeopleBreakdown;
    reading: CoverageReading;
};

// With no headcount entered on it or below it a department would read 100% from its own people, so it asks
// for a headcount instead; with an effective headcount of 0 nobody is counted at all
const getReading = (department: DepartmentWithMetrics): CoverageReading => {
    if (!department.hasHeadcount) return { kind: 'noHeadcount' };
    if (department.effectiveHeadcount <= 0) return { kind: 'nobody' };
    return {
        kind: 'coverage',
        pct: Math.round(
            100 *
                getShare(
                    department.metrics.memberCount,
                    department.effectiveHeadcount,
                ),
        ),
    };
};

// Lowest coverage first, where asking for a headcount and nobody counted both read 0, then the largest
// department, then the name
export const getCoverageRows = (
    rowDepartments: DepartmentWithMetrics[],
    colourBy: ColourBy,
): CoverageRow[] =>
    rowDepartments
        .map((department) => {
            const reading = getReading(department);
            return {
                coverage:
                    reading.kind === 'coverage'
                        ? getShare(
                              department.metrics.memberCount,
                              department.effectiveHeadcount,
                          )
                        : 0,
                row: {
                    department,
                    breakdown: getDepartmentBreakdown(department, colourBy),
                    reading,
                },
            };
        })
        .sort(
            (a, b) =>
                a.coverage - b.coverage ||
                b.row.department.effectiveHeadcount -
                    a.row.department.effectiveHeadcount ||
                a.row.department.name.localeCompare(b.row.department.name),
        )
        .map(({ row }) => row);

export type DirectRow = {
    memberCount: number;
    breakdown: PeopleBreakdown;
    reading: CoverageReading;
};

// The people directly in a department beside its sub-departments, over the headcount it keeps for them; none
// where it keeps none. Without a headcount anywhere in the department, it reads as other rows without one
export const getDirectRow = (
    department: DepartmentWithMetrics,
    children: DepartmentWithMetrics[],
    colourBy: ColourBy,
): DirectRow | null => {
    if (children.length === 0) return null;
    const { directMetrics } = department;
    const headcount = getDirectHeadcount(department, children);
    if (headcount <= 0) return null;
    return {
        memberCount: directMetrics.memberCount,
        breakdown: getPeopleBreakdown(directMetrics, headcount, colourBy),
        reading: department.hasHeadcount
            ? {
                  kind: 'coverage',
                  pct: Math.round(
                      100 * getShare(directMetrics.memberCount, headcount),
                  ),
              }
            : { kind: 'noHeadcount' },
    };
};
