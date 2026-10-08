export type DepartmentTreeNode = {
    departmentUuid: string;
    parentDepartmentUuid: string | null;
};

export type DepartmentHeadcountNode = DepartmentTreeNode & {
    headcount: number | null;
};

export type EffectiveHeadcount = {
    // Never below the department's people on Lightdash, so a headcount only ever adds people without an account
    effectiveHeadcount: number;
    // A headcount is entered on the department or on one below it
    hasHeadcount: boolean;
    headcountBelowChildren: boolean;
};

export const getParentMap = (
    nodes: DepartmentTreeNode[],
): Map<string, string | null> =>
    new Map(nodes.map((n) => [n.departmentUuid, n.parentDepartmentUuid]));

export const getChildrenMap = (
    nodes: DepartmentTreeNode[],
): Map<string | null, string[]> => {
    const known = new Set(nodes.map((n) => n.departmentUuid));
    const children = new Map<string | null, string[]>();
    nodes.forEach((n) => {
        // A parent outside the set means the department sits at the top
        const key =
            n.parentDepartmentUuid !== null && known.has(n.parentDepartmentUuid)
                ? n.parentDepartmentUuid
                : null;
        const siblings = children.get(key);
        if (siblings) siblings.push(n.departmentUuid);
        else children.set(key, [n.departmentUuid]);
    });
    return children;
};

export const getAncestorUuids = (
    departmentUuid: string,
    parentMap: Map<string, string | null>,
): string[] => {
    const ancestors: string[] = [];
    const seen = new Set<string>([departmentUuid]);
    let current = parentMap.get(departmentUuid) ?? null;
    while (current !== null && !seen.has(current)) {
        ancestors.push(current);
        seen.add(current);
        current = parentMap.get(current) ?? null;
    }
    return ancestors;
};

// Breadth first, each department once even if the stored tree holds a cycle
const collectDescendants = (
    departmentUuid: string,
    children: Map<string | null, string[]>,
): string[] => {
    const seen = new Set<string>([departmentUuid]);
    const queue = [...(children.get(departmentUuid) ?? [])];
    const descendants: string[] = [];
    for (let i = 0; i < queue.length; i += 1) {
        const next = queue[i];
        if (!seen.has(next)) {
            seen.add(next);
            descendants.push(next);
            // One push per child: spreading a very wide level into push() can overflow the stack
            (children.get(next) ?? []).forEach((child) => queue.push(child));
        }
    }
    return descendants;
};

export const getDescendantUuids = (
    departmentUuid: string,
    nodes: DepartmentTreeNode[],
): string[] => collectDescendants(departmentUuid, getChildrenMap(nodes));

export const wouldCreateCycle = (
    nodes: DepartmentTreeNode[],
    departmentUuid: string,
    newParentUuid: string | null,
): boolean =>
    newParentUuid !== null &&
    (newParentUuid === departmentUuid ||
        getDescendantUuids(departmentUuid, nodes).includes(newParentUuid));

// Every department's ancestor count, equal to getAncestorUuids(...).length, in one pass
export const getDepthMap = (
    nodes: DepartmentTreeNode[],
): Map<string, number> => {
    const parentMap = getParentMap(nodes);
    const depths = new Map<string, number>();
    parentMap.forEach((_, start) => {
        if (depths.has(start)) return;
        // Walk up until the top, a department already measured, or one already on this walk
        const path: string[] = [];
        const indexOnPath = new Map<string, number>();
        let current: string | null = start;
        while (
            current !== null &&
            parentMap.has(current) &&
            !depths.has(current) &&
            !indexOnPath.has(current)
        ) {
            indexOnPath.set(current, path.length);
            path.push(current);
            current = parentMap.get(current) ?? null;
        }
        const cycleStart =
            current === null ? undefined : indexOnPath.get(current);
        if (cycleStart !== undefined) {
            // Inside a stored cycle the walk goes round once, so every member counts the others
            const cycleDepth = path.length - cycleStart - 1;
            path.forEach((uuid, i) =>
                depths.set(
                    uuid,
                    i >= cycleStart ? cycleDepth : cycleDepth + cycleStart - i,
                ),
            );
            return;
        }
        // A parent outside the set counts as one ancestor with none of its own
        const base = current === null ? -1 : (depths.get(current) ?? 0);
        path.forEach((uuid, i) => depths.set(uuid, base + path.length - i));
    });
    return depths;
};

// Levels in a department's branch, itself included, so 1 when it has no sub-departments
export const getBranchHeight = (
    departmentUuid: string,
    nodes: DepartmentTreeNode[],
): number => {
    const children = getChildrenMap(nodes);
    const seen = new Set<string>([departmentUuid]);
    let level = [departmentUuid];
    let height = 0;
    while (level.length > 0) {
        height += 1;
        const next: string[] = [];
        level.forEach((uuid) =>
            (children.get(uuid) ?? []).forEach((child) => {
                if (!seen.has(child)) {
                    seen.add(child);
                    next.push(child);
                }
            }),
        );
        level = next;
    }
    return height;
};

type HeadcountFrame = {
    uuid: string;
    children: string[];
    next: number;
    childValues: number[];
    hasChildHeadcount: boolean;
};

// The headcount entered, else the sum of the children's, and never below the people on Lightdash
// (memberCounts, rolled up), so a department with no headcount anywhere counts its people
export const computeEffectiveHeadcounts = (
    nodes: DepartmentHeadcountNode[],
    memberCounts: Map<string, number>,
): Map<string, EffectiveHeadcount> => {
    const children = getChildrenMap(nodes);
    const byUuid = new Map(nodes.map((n) => [n.departmentUuid, n]));
    const result = new Map<string, EffectiveHeadcount>();
    // Post-order over an explicit stack; a child already on the path (a stored cycle) is skipped
    const onPath = new Set<string>();
    const open = (uuid: string): HeadcountFrame => {
        onPath.add(uuid);
        return {
            uuid,
            children: children.get(uuid) ?? [],
            next: 0,
            childValues: [],
            hasChildHeadcount: false,
        };
    };

    nodes.forEach((root) => {
        if (result.has(root.departmentUuid)) return;
        const stack: HeadcountFrame[] = [open(root.departmentUuid)];
        while (stack.length > 0) {
            const frame = stack[stack.length - 1];
            if (frame.next < frame.children.length) {
                const child = frame.children[frame.next];
                frame.next += 1;
                const known = onPath.has(child) ? null : result.get(child);
                if (known === undefined) {
                    stack.push(open(child));
                } else if (known !== null) {
                    frame.childValues.push(known.effectiveHeadcount);
                    frame.hasChildHeadcount ||= known.hasHeadcount;
                }
            } else {
                stack.pop();
                onPath.delete(frame.uuid);
                const childrenSum =
                    frame.childValues.length > 0
                        ? frame.childValues.reduce(
                              (sum, value) => sum + value,
                              0,
                          )
                        : null;
                const own = byUuid.get(frame.uuid)?.headcount ?? null;
                const value: EffectiveHeadcount = {
                    effectiveHeadcount: Math.max(
                        own ?? childrenSum ?? 0,
                        memberCounts.get(frame.uuid) ?? 0,
                    ),
                    hasHeadcount: own !== null || frame.hasChildHeadcount,
                    headcountBelowChildren:
                        own !== null &&
                        childrenSum !== null &&
                        own < childrenSum,
                };
                result.set(frame.uuid, value);
                const parent = stack[stack.length - 1];
                if (parent !== undefined) {
                    parent.childValues.push(value.effectiveHeadcount);
                    parent.hasChildHeadcount ||= value.hasHeadcount;
                }
            }
        }
    });
    return result;
};

export const rollUpByDepartment = <T>(
    nodes: DepartmentTreeNode[],
    direct: Map<string, T[]>,
): Map<string, T[]> => {
    // Built once for the whole tree, not once per department
    const children = getChildrenMap(nodes);
    const rolled = new Map<string, T[]>();
    const isUnique =
        new Set(nodes.map((n) => n.departmentUuid)).size === nodes.length;
    if (isUnique) {
        // Breadth first from the top. A department's descendants come in this order in its own
        // breadth-first walk too, so each list is its own people, then each descendant's, in order
        const parentOf = new Map<string, string | null>();
        const order: string[] = [];
        const queue = [...(children.get(null) ?? [])];
        queue.forEach((uuid) => parentOf.set(uuid, null));
        for (let i = 0; i < queue.length; i += 1) {
            const uuid = queue[i];
            order.push(uuid);
            (children.get(uuid) ?? []).forEach((child) => {
                parentOf.set(child, uuid);
                queue.push(child);
            });
        }
        order.forEach((uuid) =>
            rolled.set(uuid, [...(direct.get(uuid) ?? [])]),
        );
        order.forEach((uuid) => {
            const own = direct.get(uuid) ?? [];
            if (own.length === 0) return;
            let ancestor = parentOf.get(uuid) ?? null;
            while (ancestor !== null) {
                const list = rolled.get(ancestor);
                if (list) own.forEach((item) => list.push(item));
                ancestor = parentOf.get(ancestor) ?? null;
            }
        });
    }
    // Departments not reachable from the top sit in a stored cycle; walk each one on its own
    nodes.forEach((n) => {
        if (rolled.has(n.departmentUuid)) return;
        rolled.set(
            n.departmentUuid,
            [
                n.departmentUuid,
                ...collectDescendants(n.departmentUuid, children),
            ].flatMap((uuid) => direct.get(uuid) ?? []),
        );
    });
    return new Map(
        nodes.map((n) => [
            n.departmentUuid,
            rolled.get(n.departmentUuid) ?? [],
        ]),
    );
};
