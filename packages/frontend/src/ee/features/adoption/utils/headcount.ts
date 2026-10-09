import {
    getResidualHeadcount,
    type DepartmentWithMetrics,
} from '@lightdash/common';

const sumEffectiveHeadcounts = (departments: DepartmentWithMetrics[]): number =>
    departments.reduce(
        (sum, department) => sum + department.effectiveHeadcount,
        0,
    );

// The headcount a department keeps for the people directly in it beside its sub-departments. The map's
// "Directly in" circle and the panel's row both read it, so they never disagree
export const getDirectHeadcount = (
    department: DepartmentWithMetrics,
    children: DepartmentWithMetrics[],
): number =>
    getResidualHeadcount(
        department.effectiveHeadcount,
        sumEffectiveHeadcounts(children),
        department.directMetrics.memberCount,
    );

// The least a department's headcount counts: its sub-departments' effective headcounts plus its own people on
// Lightdash, or without sub-departments, its people on Lightdash
export const getHeadcountFloor = (
    department: DepartmentWithMetrics,
    children: DepartmentWithMetrics[],
): number =>
    children.length > 0
        ? sumEffectiveHeadcounts(children) +
          department.directMetrics.memberCount
        : department.metrics.memberCount;
