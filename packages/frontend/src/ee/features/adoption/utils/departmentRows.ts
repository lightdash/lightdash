import {
    getChildrenMap,
    type Department,
    type DepartmentOwner,
    type DepartmentWithMetrics,
    type RoleSplit,
} from '@lightdash/common';
import dayjs from 'dayjs';

// Levels shown in the table; deeper levels open on the department page
// ts-unused-exports:disable-next-line
export const MAX_TABLE_DEPTH = 3;

export type DepartmentRow = {
    department: DepartmentWithMetrics;
    depth: number;
    childCount: number;
    canExpand: boolean;
    isExpanded: boolean;
};

// Ascending coverage; departments without a headcount go last, ties by name
// ts-unused-exports:disable-next-line
export const sortByCoverage = (
    departments: DepartmentWithMetrics[],
): DepartmentWithMetrics[] =>
    [...departments].sort((a, b) => {
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

// A share that rounds to 0% but has people in it reads "<1%", never "0%"
export const formatShare = (pct: number | null, count: number): string => {
    if (pct === null) return `${count} ${count === 1 ? 'person' : 'people'}`;
    const label = pct === 0 && count > 0 ? '<1%' : `${pct}%`;
    return `${label} (${count})`;
};

const plural = (count: number, singular: string): string =>
    `${count} ${singular}${count === 1 ? '' : 's'}`;

export const formatRoleSplit = (split: RoleSplit): string => {
    const parts = [
        split.viewers > 0 ? plural(split.viewers, 'viewer') : null,
        split.interactiveViewers > 0
            ? `${split.interactiveViewers} interactive`
            : null,
        split.editors > 0 ? plural(split.editors, 'editor') : null,
        split.admins > 0 ? plural(split.admins, 'admin') : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(', ') : 'No one yet';
};

export const formatOwners = (owners: DepartmentOwner[]): string => {
    if (owners.length === 0) return '–';
    const [first, ...rest] = owners;
    return rest.length > 0 ? `${first.name} +${rest.length}` : first.name;
};

export const formatTarget = (
    department: Pick<Department, 'targetActiveUsers' | 'targetDate'>,
): string => {
    if (department.targetActiveUsers === null) return '–';
    const target = `${department.targetActiveUsers} active`;
    return department.targetDate === null
        ? target
        : `${target} by ${dayjs(department.targetDate).format('D MMM YYYY')}`;
};
