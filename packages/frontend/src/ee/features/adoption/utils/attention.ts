import { type Department, type DepartmentMembership } from '@lightdash/common';
import { formatQuantity, PEOPLE } from './format';

// A department a person in a conflict is reached in, with the groups linked to it
export type ConflictCandidate = {
    departmentUuid: string;
    name: string;
    groupNames: string[];
};

export type AttentionRow = {
    member: DepartmentMembership;
    kind: 'conflict' | 'unassigned';
    candidates: ConflictCandidate[]; // by department name; empty for unassigned people
};

type AttentionDepartment = Pick<
    Department,
    'departmentUuid' | 'name' | 'linkedGroups'
>;

const people = (count: number): string =>
    `${formatQuantity(count, PEOPLE)} ${count === 1 ? 'is' : 'are'}`;

export const formatAttention = (
    conflictCount: number,
    unassignedCount: number,
): string | null => {
    const parts = [
        conflictCount > 0
            ? `${people(conflictCount)} in more than one department`
            : null,
        unassignedCount > 0
            ? `${people(unassignedCount)} in no department`
            : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(' · ') : null;
};

export const getAttentionRows = (
    membership: DepartmentMembership[],
    departments: AttentionDepartment[],
): AttentionRow[] => {
    const byUuid = new Map(departments.map((d) => [d.departmentUuid, d]));
    const conflicts = membership.flatMap((member): AttentionRow[] =>
        member.resolution.kind === 'conflict'
            ? [
                  {
                      member,
                      kind: 'conflict',
                      candidates: member.resolution.departmentUuids
                          .flatMap((uuid) => byUuid.get(uuid) ?? [])
                          .map((department) => ({
                              departmentUuid: department.departmentUuid,
                              name: department.name,
                              groupNames: department.linkedGroups
                                  .map((group) => group.name)
                                  .sort((a, b) => a.localeCompare(b)),
                          }))
                          .sort((a, b) => a.name.localeCompare(b.name)),
                  },
              ]
            : [],
    );
    const unassigned = membership.flatMap((member): AttentionRow[] =>
        member.resolution.kind === 'unassigned'
            ? [{ member, kind: 'unassigned', candidates: [] }]
            : [],
    );
    return [...conflicts, ...unassigned];
};

// "a", "a or b", "a, b or c"
const listAlternatives = (names: string[]): string =>
    names.length < 2
        ? names.join('')
        : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;

// The membership response names no groups, so every group linked to the department is offered
export const describeCandidate = ({
    name,
    groupNames,
}: ConflictCandidate): string =>
    groupNames.length === 0
        ? name
        : `${name} through ${listAlternatives(groupNames)}`;

// The endpoint replaces a department's assigned people, so a request carries everyone already assigned
export const getPlacement = (
    departments: Pick<Department, 'departmentUuid' | 'explicitMemberUuids'>[],
    departmentUuid: string,
    userUuids: string[],
): { departmentUuid: string; userUuids: string[] } | null => {
    const department = departments.find(
        (d) => d.departmentUuid === departmentUuid,
    );
    if (department === undefined) return null;
    return {
        departmentUuid,
        userUuids: Array.from(
            new Set([...department.explicitMemberUuids, ...userUuids]),
        ),
    };
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
