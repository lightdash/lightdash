import {
    getChildrenMap,
    type AdoptionMetrics,
    type DepartmentWithMetrics,
} from '@lightdash/common';

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

// The people directly in a department are counted over themselves, as its headcount is for the whole department
export const getDirectBreakdown = (
    department: DepartmentWithMetrics,
): PeopleBreakdown =>
    getPeopleBreakdown(
        department.directMetrics,
        department.directMetrics.memberCount,
    );

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

export type CoverageRow = {
    department: DepartmentWithMetrics;
    breakdown: PeopleBreakdown;
    // On Lightdash as a share of the effective headcount, rounded; null asks for a headcount instead
    coveragePct: number | null;
};

// Lowest coverage first, nobody counted reading 0, then the largest department. One with no headcount and
// no sub-departments would read 100% from its own people, so it asks for a headcount and sorts as 0
export const getCoverageRows = (
    rowDepartments: DepartmentWithMetrics[],
    departments: DepartmentWithMetrics[],
): CoverageRow[] => {
    const children = getChildrenMap(departments);
    return rowDepartments
        .map((department) => {
            const { effectiveHeadcount, metrics } = department;
            const isAskingForHeadcount =
                !department.hasHeadcount &&
                !children.has(department.departmentUuid);
            const coverage =
                isAskingForHeadcount || effectiveHeadcount <= 0
                    ? 0
                    : metrics.memberCount / effectiveHeadcount;
            return {
                coverage,
                row: {
                    department,
                    breakdown: getDepartmentBreakdown(department),
                    coveragePct: isAskingForHeadcount
                        ? null
                        : Math.round(coverage * 100),
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
