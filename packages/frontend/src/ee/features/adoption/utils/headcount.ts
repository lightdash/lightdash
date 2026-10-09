import {
    getChildrenHeadcount,
    getResidualHeadcount,
    type DepartmentWithMetrics,
} from '@lightdash/common';

// What its sub-departments count together as the server counts it, a person in several of them once
const getSubDepartmentsHeadcount = (
    department: DepartmentWithMetrics,
    children: DepartmentWithMetrics[],
): number =>
    getChildrenHeadcount(
        {
            memberCount: department.metrics.memberCount,
            directMemberCount: department.directMetrics.memberCount,
        },
        children.map((child) => ({
            effectiveHeadcount: child.effectiveHeadcount,
            memberCount: child.metrics.memberCount,
        })),
    );

// The headcount a department keeps for the people directly in it beside its sub-departments. The map's
// "Directly in" circle and the panel's row both read it, so they never disagree
export const getDirectHeadcount = (
    department: DepartmentWithMetrics,
    children: DepartmentWithMetrics[],
): number =>
    getResidualHeadcount(
        department.effectiveHeadcount,
        getSubDepartmentsHeadcount(department, children),
        department.directMetrics.memberCount,
    );

// The least a department's headcount counts: its sub-departments' total plus its own people on Lightdash, or
// without sub-departments, its people on Lightdash
export const getHeadcountFloor = (
    department: DepartmentWithMetrics,
    children: DepartmentWithMetrics[],
): number =>
    children.length > 0
        ? getSubDepartmentsHeadcount(department, children) +
          department.directMetrics.memberCount
        : department.metrics.memberCount;
