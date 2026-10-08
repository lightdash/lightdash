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
    parentMap: Map<string, string | null>,
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
    // Most specific wins: drop any candidate that is an ancestor of another
    const ancestorsOfCandidates = new Set(
        candidates.flatMap((c) => getAncestorUuids(c, parentMap)),
    );
    const mostSpecific = candidates.filter(
        (c) => !ancestorsOfCandidates.has(c),
    );
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
    return rows.map((row) => ({
        userUuid: row.userUuid,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        role: row.role,
        resolution: resolveOne(row, parentMap),
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
