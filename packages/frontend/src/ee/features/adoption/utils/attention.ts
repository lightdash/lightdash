import { type DepartmentMembership } from '@lightdash/common';
import { type NamedDepartment } from './departmentForm';

export type AttentionRow = {
    member: DepartmentMembership;
    kind: 'conflict' | 'unassigned';
    candidateNames: string[];
};

const people = (count: number, verb: [string, string]): string =>
    count === 1 ? `1 person ${verb[0]}` : `${count} people ${verb[1]}`;

export const formatAttention = (
    conflictCount: number,
    unassignedCount: number,
): string | null => {
    const parts = [
        conflictCount > 0
            ? `${people(conflictCount, ['is', 'are'])} in more than one department`
            : null,
        unassignedCount > 0
            ? `${people(unassignedCount, ['is', 'are'])} in no department`
            : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(' · ') : null;
};

export const getAttentionRows = (
    membership: DepartmentMembership[],
    departments: NamedDepartment[],
): AttentionRow[] => {
    const names = new Map(departments.map((d) => [d.departmentUuid, d.name]));
    const conflicts = membership.flatMap((member): AttentionRow[] =>
        member.resolution.kind === 'conflict'
            ? [
                  {
                      member,
                      kind: 'conflict',
                      candidateNames: member.resolution.departmentUuids
                          .flatMap((uuid) => names.get(uuid) ?? [])
                          .sort(),
                  },
              ]
            : [],
    );
    const unassigned = membership.flatMap((member): AttentionRow[] =>
        member.resolution.kind === 'unassigned'
            ? [{ member, kind: 'unassigned', candidateNames: [] }]
            : [],
    );
    return [...conflicts, ...unassigned];
};

export const getMemberName = (member: DepartmentMembership): string =>
    `${member.firstName} ${member.lastName}`.trim() || member.email;

// How many rows carry each name, so two people with one name can be told apart
export const countAttentionNames = (
    rows: AttentionRow[],
): Map<string, number> => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
        const name = getMemberName(row.member);
        counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return counts;
};

export const searchAttentionRows = (
    rows: AttentionRow[],
    search: string,
): AttentionRow[] => {
    const term = search.trim().toLowerCase();
    if (term.length === 0) return rows;
    return rows.filter(
        ({ member }) =>
            getMemberName(member).toLowerCase().includes(term) ||
            member.email.toLowerCase().includes(term),
    );
};
