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
        children.set(key, [...(children.get(key) ?? []), n.departmentUuid]);
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

export const getDescendantUuids = (
    departmentUuid: string,
    nodes: DepartmentTreeNode[],
): string[] => {
    const children = getChildrenMap(nodes);
    const seen = new Set<string>([departmentUuid]);
    const queue = [...(children.get(departmentUuid) ?? [])];
    const descendants: string[] = [];
    while (queue.length > 0) {
        const next = queue.shift() as string;
        if (!seen.has(next)) {
            seen.add(next);
            descendants.push(next);
            queue.push(...(children.get(next) ?? []));
        }
    }
    return descendants;
};

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
): Map<string, T[]> =>
    new Map(
        nodes.map((n) => [
            n.departmentUuid,
            [
                n.departmentUuid,
                ...getDescendantUuids(n.departmentUuid, nodes),
            ].flatMap((uuid) => direct.get(uuid) ?? []),
        ]),
    );
