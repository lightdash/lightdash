export type DepartmentTreeNode = {
    departmentUuid: string;
    parentDepartmentUuid: string | null;
};

export type DepartmentHeadcountNode = DepartmentTreeNode & {
    headcount: number | null;
};

export type EffectiveHeadcount = {
    effectiveHeadcount: number | null;
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
            queue.push(...(children.get(next) ?? []));
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

export const computeEffectiveHeadcounts = (
    nodes: DepartmentHeadcountNode[],
): Map<string, EffectiveHeadcount> => {
    const children = getChildrenMap(nodes);
    const byUuid = new Map(nodes.map((n) => [n.departmentUuid, n]));
    const result = new Map<string, EffectiveHeadcount>();

    const visit = (uuid: string, path: Set<string>): EffectiveHeadcount => {
        const cached = result.get(uuid);
        if (cached) return cached;
        const childValues = (children.get(uuid) ?? [])
            .filter((child) => !path.has(child))
            .map(
                (child) =>
                    visit(child, new Set([...path, child])).effectiveHeadcount,
            )
            .filter((value): value is number => value !== null);
        const childrenSum =
            childValues.length > 0
                ? childValues.reduce((sum, value) => sum + value, 0)
                : null;
        const own = byUuid.get(uuid)?.headcount ?? null;
        const value: EffectiveHeadcount = {
            effectiveHeadcount: own ?? childrenSum,
            headcountBelowChildren:
                own !== null && childrenSum !== null && own < childrenSum,
        };
        result.set(uuid, value);
        return value;
    };

    nodes.forEach((n) => visit(n.departmentUuid, new Set([n.departmentUuid])));
    return result;
};

export const rollUpByDepartment = <T>(
    nodes: DepartmentTreeNode[],
    direct: Map<string, T[]>,
): Map<string, T[]> => {
    // Built once for the whole tree, not once per department
    const children = getChildrenMap(nodes);
    return new Map(
        nodes.map((n) => [
            n.departmentUuid,
            [
                n.departmentUuid,
                ...collectDescendants(n.departmentUuid, children),
            ].flatMap((uuid) => direct.get(uuid) ?? []),
        ]),
    );
};
