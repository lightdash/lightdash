import {
    getChildrenMap,
    type AdoptionMetrics,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import { getDirectHeadcount } from './headcount';

// Everyone counted, in three parts that add up to the effective headcount. The panel's bars and
// legend and the legend under the map all read it, so they never disagree
export type PeopleBreakdown = {
    active: number;
    onLightdashNotActive: number;
    noAccount: number;
};

export const getPeopleBreakdown = (
    metrics: Pick<AdoptionMetrics, 'memberCount' | 'activeCount30d'>,
    effectiveHeadcount: number,
): PeopleBreakdown => ({
    active: metrics.activeCount30d,
    onLightdashNotActive: Math.max(
        metrics.memberCount - metrics.activeCount30d,
        0,
    ),
    noAccount: Math.max(effectiveHeadcount - metrics.memberCount, 0),
});

export const getDepartmentBreakdown = (
    department: DepartmentWithMetrics,
): PeopleBreakdown =>
    getPeopleBreakdown(department.metrics, department.effectiveHeadcount);

// Everyone placed in a department: the top-level departments added up. The summary's organization
// numbers are not used, as they count everyone on Lightdash, placed or not
export const getOrganizationBreakdown = (
    departments: DepartmentWithMetrics[],
): PeopleBreakdown => {
    const topLevel = new Set(getChildrenMap(departments).get(null));
    const sum = (count: (department: DepartmentWithMetrics) => number) =>
        departments.reduce(
            (total, department) =>
                topLevel.has(department.departmentUuid)
                    ? total + count(department)
                    : total,
            0,
        );
    return getPeopleBreakdown(
        {
            memberCount: sum((department) => department.metrics.memberCount),
            activeCount30d: sum(
                (department) => department.metrics.activeCount30d,
            ),
        },
        sum((department) => department.effectiveHeadcount),
    );
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

// With no headcount and no sub-departments a department would read 100% from its own people, so it asks for
// a headcount instead; with an effective headcount of 0 nobody is counted at all
const getReading = (
    department: DepartmentWithMetrics,
    hasChildren: boolean,
): CoverageReading => {
    if (!department.hasHeadcount && !hasChildren)
        return { kind: 'noHeadcount' };
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
    departments: DepartmentWithMetrics[],
): CoverageRow[] => {
    const children = getChildrenMap(departments);
    return rowDepartments
        .map((department) => {
            const reading = getReading(
                department,
                children.has(department.departmentUuid),
            );
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
                    breakdown: getDepartmentBreakdown(department),
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
};

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
): DirectRow | null => {
    if (children.length === 0) return null;
    const { directMetrics } = department;
    const headcount = getDirectHeadcount(department, children);
    if (headcount <= 0) return null;
    return {
        memberCount: directMetrics.memberCount,
        breakdown: getPeopleBreakdown(directMetrics, headcount),
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
