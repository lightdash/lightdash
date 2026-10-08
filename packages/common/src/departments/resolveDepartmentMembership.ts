import {
    type DepartmentMembership,
    type MembershipKind,
    type MembershipPlacement,
    type ResolvedMemberRow,
} from '../types/departments';
import {
    getAncestorUuids,
    getParentMap,
    type DepartmentTreeNode,
} from './departmentTree';

const getPlacements = (
    row: ResolvedMemberRow,
    ancestorsOf: (departmentUuid: string) => Set<string>,
): MembershipPlacement[] => {
    const explicitUuids = new Set(row.explicitDepartmentUuids);
    const firstGroupNames = new Map<string, string>();
    row.groupLinks.forEach(({ departmentUuid, groupName }) => {
        const current = firstGroupNames.get(departmentUuid);
        if (current === undefined || groupName < current) {
            firstGroupNames.set(departmentUuid, groupName);
        }
    });
    const linkedUuids = [
        ...new Set([...explicitUuids, ...firstGroupNames.keys()]),
    ];
    // Most specific wins: drop a strict ancestor of another placement; in a stored cycle
    // each is the other's ancestor, so both stay. A lone department needs no walk
    const mostSpecific =
        linkedUuids.length < 2
            ? linkedUuids
            : linkedUuids.filter(
                  (uuid) =>
                      !linkedUuids.some(
                          (other) =>
                              other !== uuid &&
                              ancestorsOf(other).has(uuid) &&
                              !ancestorsOf(uuid).has(other),
                      ),
              );
    return mostSpecific.sort().map(
        (departmentUuid): MembershipPlacement =>
            explicitUuids.has(departmentUuid)
                ? {
                      departmentUuid,
                      source: 'explicit',
                      sourceGroupName: null,
                  }
                : {
                      departmentUuid,
                      source: 'group',
                      sourceGroupName:
                          firstGroupNames.get(departmentUuid) ?? null,
                  },
    );
};

const getKind = (placementCount: number): MembershipKind => {
    if (placementCount === 0) return 'unassigned';
    if (placementCount === 1) return 'assigned';
    return 'shared';
};

export const resolveDepartmentMembership = (
    rows: ResolvedMemberRow[],
    departments: DepartmentTreeNode[],
): DepartmentMembership[] => {
    const parentMap = getParentMap(departments);
    // Walked once per department per call, however many people share it
    const ancestorSets = new Map<string, Set<string>>();
    const ancestorsOf = (departmentUuid: string): Set<string> => {
        const known = ancestorSets.get(departmentUuid);
        if (known) return known;
        const ancestors = new Set(getAncestorUuids(departmentUuid, parentMap));
        ancestorSets.set(departmentUuid, ancestors);
        return ancestors;
    };
    return rows.map((row) => {
        const placements = getPlacements(row, ancestorsOf);
        const placedUuids = placements.map((p) => p.departmentUuid);
        // A primary that is not one of the placements is ignored
        const primaryDepartmentUuid =
            row.primaryDepartmentUuid !== null &&
            placedUuids.includes(row.primaryDepartmentUuid)
                ? row.primaryDepartmentUuid
                : null;
        return {
            userUuid: row.userUuid,
            email: row.email,
            firstName: row.firstName,
            lastName: row.lastName,
            role: row.role,
            kind: getKind(placements.length),
            placements,
            primaryDepartmentUuid,
            countedDepartmentUuids:
                primaryDepartmentUuid === null
                    ? placedUuids
                    : [primaryDepartmentUuid],
        };
    });
};

export const getDirectMembersByDepartment = (
    membership: DepartmentMembership[],
): Map<string, DepartmentMembership[]> => {
    const direct = new Map<string, DepartmentMembership[]>();
    membership.forEach((member) => {
        member.countedDepartmentUuids.forEach((departmentUuid) => {
            const members = direct.get(departmentUuid);
            if (members) members.push(member);
            else direct.set(departmentUuid, [member]);
        });
    });
    return direct;
};
