import {
    type DepartmentMembership,
    type MembershipResolution,
    type ResolvedMemberRow,
} from '../types/departments';
import {
    getAncestorUuids,
    getParentMap,
    type DepartmentTreeNode,
} from './departmentTree';

const resolveOne = (
    row: ResolvedMemberRow,
    ancestorsOf: (departmentUuid: string) => Set<string>,
): MembershipResolution => {
    if (row.explicitDepartmentUuid !== null) {
        return {
            kind: 'assigned',
            departmentUuid: row.explicitDepartmentUuid,
            source: 'explicit',
            sourceGroupName: null,
        };
    }
    const candidates = Array.from(
        new Set(row.groupLinks.map((l) => l.departmentUuid)),
    ).sort();
    // Most specific wins: drop any candidate that is an ancestor of another.
    // One walk up from each candidate marks the candidates it passes, so the cost grows linearly
    const candidateSet = new Set(candidates);
    const coveredBy = new Map<string, string>();
    if (candidates.length > 1) {
        candidates.forEach((other) =>
            ancestorsOf(other).forEach((ancestor) => {
                if (ancestor !== other && candidateSet.has(ancestor)) {
                    coveredBy.set(ancestor, other);
                }
            }),
        );
    }
    const mostSpecific = candidates.filter((c) => !coveredBy.has(c));
    if (mostSpecific.length === 1) {
        const [departmentUuid] = mostSpecific;
        const [firstGroupName] = row.groupLinks
            .filter((l) => l.departmentUuid === departmentUuid)
            .map((l) => l.groupName)
            .sort();
        return {
            kind: 'assigned',
            departmentUuid,
            source: 'group',
            sourceGroupName: firstGroupName ?? null,
        };
    }
    if (mostSpecific.length > 1) {
        return { kind: 'conflict', departmentUuids: mostSpecific };
    }
    return { kind: 'unassigned' };
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
    return rows.map((row) => ({
        userUuid: row.userUuid,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        role: row.role,
        resolution: resolveOne(row, ancestorsOf),
    }));
};

export const getDirectMembersByDepartment = (
    membership: DepartmentMembership[],
): Map<string, DepartmentMembership[]> => {
    const direct = new Map<string, DepartmentMembership[]>();
    membership.forEach((member) => {
        if (member.resolution.kind === 'assigned') {
            const { departmentUuid } = member.resolution;
            const members = direct.get(departmentUuid);
            if (members) members.push(member);
            else direct.set(departmentUuid, [member]);
        }
    });
    return direct;
};
