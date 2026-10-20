import {
    getChildrenMap,
    type DepartmentOwner,
    type DepartmentWithMetrics,
    type RoleSplit,
} from '@lightdash/common';
import { formatCount, formatQuantity, PEOPLE, type Noun } from './format';

// Levels shown in the table; deeper levels are the sub-departments of the department selected
const MAX_TABLE_DEPTH = 3;

export type DepartmentRow = {
    department: DepartmentWithMetrics;
    depth: number;
    childCount: number;
    canExpand: boolean;
    isExpanded: boolean;
};

// Ascending coverage; departments without a headcount go last, ties by name
const sortByCoverage = (
    departments: DepartmentWithMetrics[],
): DepartmentWithMetrics[] =>
    [...departments].sort((a, b) => {
        if (a.hasHeadcount !== b.hasHeadcount) return a.hasHeadcount ? -1 : 1;
        if (!a.hasHeadcount) return a.name.localeCompare(b.name);
        const left = a.metrics.coveragePct;
        const right = b.metrics.coveragePct;
        if (left === null && right === null)
            return a.name.localeCompare(b.name);
        if (left === null) return 1;
        if (right === null) return -1;
        return left - right || a.name.localeCompare(b.name);
    });

// Flattens the tree into the rows currently visible, in display order
export const buildDepartmentRows = (
    departments: DepartmentWithMetrics[],
    expanded: Set<string>,
): DepartmentRow[] => {
    const children = getChildrenMap(departments);
    const byUuid = new Map(departments.map((d) => [d.departmentUuid, d]));
    const childrenOf = (parent: string | null): DepartmentWithMetrics[] =>
        sortByCoverage(
            (children.get(parent) ?? []).flatMap((uuid) => {
                const department = byUuid.get(uuid);
                return department ? [department] : [];
            }),
        );

    const visit = (parent: string | null, depth: number): DepartmentRow[] =>
        childrenOf(parent).flatMap((department) => {
            const childCount = (children.get(department.departmentUuid) ?? [])
                .length;
            const canExpand = childCount > 0 && depth < MAX_TABLE_DEPTH - 1;
            const isExpanded =
                canExpand && expanded.has(department.departmentUuid);
            return [
                { department, depth, childCount, canExpand, isExpanded },
                ...(isExpanded
                    ? visit(department.departmentUuid, depth + 1)
                    : []),
            ];
        });

    return visit(null, 0);
};

// Shown in place of coverage where no headcount is entered on a department or below it, which would read 100%
export const getMissingHeadcountWord = (canManage: boolean): string =>
    canManage ? 'Add headcount' : 'No headcount';

// A share that rounds to 0% but has people in it reads "<1%", never "0%"
export const formatShare = (pct: number | null, count: number): string => {
    if (pct === null) return formatQuantity(count, PEOPLE);
    const label = pct === 0 && count > 0 ? '<1%' : `${pct}%`;
    return `${label} (${formatCount(count)})`;
};

const VIEWERS: Noun = { one: 'viewer', other: 'viewers' };
const INTERACTIVE_VIEWERS: Noun = {
    one: 'interactive viewer',
    other: 'interactive viewers',
};
const EDITORS: Noun = { one: 'editor', other: 'editors' };
const ADMINS: Noun = { one: 'admin', other: 'admins' };

export const formatRoleSplit = (split: RoleSplit): string => {
    const parts = [
        split.viewers > 0 ? formatQuantity(split.viewers, VIEWERS) : null,
        split.interactiveViewers > 0
            ? formatQuantity(split.interactiveViewers, INTERACTIVE_VIEWERS)
            : null,
        split.editors > 0 ? formatQuantity(split.editors, EDITORS) : null,
        split.admins > 0 ? formatQuantity(split.admins, ADMINS) : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(', ') : 'No one yet';
};

export const formatOwners = (owners: DepartmentOwner[]): string => {
    if (owners.length === 0) return '–';
    const [first, ...rest] = owners;
    return rest.length > 0 ? `${first.name} +${rest.length}` : first.name;
};
