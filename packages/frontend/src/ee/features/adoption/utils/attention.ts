import {
    type Department,
    type DepartmentMembership,
    type DepartmentRef,
} from '@lightdash/common';
import { formatQuantity, PEOPLE } from './format';

// The placement modal's tabs: people in no department, and people in more than one
export type MembershipTab = 'unassigned' | 'shared';

export type UnassignedRow = { member: DepartmentMembership };

export type SharedRow = {
    member: DepartmentMembership;
    departments: DepartmentRef[]; // their departments, by name
};

type PersonRow = {
    member: Pick<DepartmentMembership, 'firstName' | 'lastName' | 'email'>;
};

const people = (count: number): string =>
    `${formatQuantity(count, PEOPLE)} ${count === 1 ? 'is' : 'are'}`;

export const formatUnassigned = (count: number): string =>
    `${people(count)} in no department`;

export const formatShared = (count: number): string =>
    `${people(count)} in more than one department`;

export const parseMembershipTab = (value: string | null): MembershipTab =>
    value === 'shared' ? 'shared' : 'unassigned';

export const getMemberName = (
    member: Pick<DepartmentMembership, 'firstName' | 'lastName' | 'email'>,
): string => `${member.firstName} ${member.lastName}`.trim() || member.email;

export const getUnassignedRows = (
    membership: DepartmentMembership[],
): UnassignedRow[] =>
    membership
        .filter((member) => member.kind === 'unassigned')
        .map((member) => ({ member }));

// By name, so a row stays where it is when where the person counts changes
export const getSharedRows = (
    membership: DepartmentMembership[],
    departments: Pick<Department, 'departmentUuid' | 'name'>[],
): SharedRow[] => {
    const names = new Map(departments.map((d) => [d.departmentUuid, d.name]));
    return membership
        .filter((member) => member.kind === 'shared')
        .map((member) => ({
            member,
            departments: member.placements
                .flatMap(({ departmentUuid }): DepartmentRef[] => {
                    const name = names.get(departmentUuid);
                    return name === undefined ? [] : [{ departmentUuid, name }];
                })
                .sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) =>
            getMemberName(a.member).localeCompare(getMemberName(b.member)),
        );
};

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

// How many rows carry each name, so two people with one name can be told apart
export const countAttentionNames = (rows: PersonRow[]): Map<string, number> => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
        const name = getMemberName(row.member);
        counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return counts;
};

export const searchAttentionRows = <Row extends PersonRow>(
    rows: Row[],
    search: string,
): Row[] => {
    const term = search.trim().toLowerCase();
    if (term.length === 0) return rows;
    return rows.filter(
        ({ member }) =>
            getMemberName(member).toLowerCase().includes(term) ||
            member.email.toLowerCase().includes(term),
    );
};
