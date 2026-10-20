import {
    getAncestorUuids,
    getDescendantUuids,
    getParentMap,
    type CreateDepartment,
    type DepartmentMember,
    type DepartmentMembership,
    type DepartmentOwnerInput,
    type UpdateDepartment,
} from '@lightdash/common';
import { formatCount } from './format';

export const NAME_MAX_LENGTH = 255;
export const HEADCOUNT_NOTE_MAX_LENGTH = 500;
// The server refuses more owners than this
export const MAX_OWNERS = 20;
export const MAX_WHOLE_NUMBER = 2147483647;

export type NamedDepartment = {
    departmentUuid: string;
    parentDepartmentUuid: string | null;
    name: string;
};

export type ResolvedMemberLine = {
    member: Pick<
        DepartmentMembership,
        'userUuid' | 'firstName' | 'lastName' | 'email'
    >;
    via: string | null;
};

export const encodeOwner = (owner: DepartmentOwnerInput): string =>
    `${owner.type}:${owner.uuid}`;

export const decodeOwners = (values: string[]): DepartmentOwnerInput[] =>
    values.flatMap((value) => {
        const [type, uuid] = value.split(':');
        return (type === 'user' || type === 'group') && uuid
            ? [{ type, uuid }]
            : [];
    });

export const toNullableNumber = (value: number | string): number | null =>
    value === '' ? null : Number(value);

// Only people on Lightdash can be newly assigned or made owners; anyone already chosen stays on offer
export const getAssignableUsers = <
    T extends { userUuid: string; isActive: boolean; isPending?: boolean },
>(
    users: T[],
    alreadyChosen: Set<string>,
): T[] =>
    users.filter(
        (user) =>
            (user.isActive && user.isPending !== true) ||
            alreadyChosen.has(user.userUuid),
    );

// The note always shows on one line and the server refuses line breaks, so they become spaces
export const cleanHeadcountNote = (value: string): string | null => {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    return cleaned.length > 0 ? cleaned : null;
};

export const getDepartmentPathLabel = (
    departmentUuid: string,
    departments: NamedDepartment[],
): string => {
    const names = new Map(departments.map((d) => [d.departmentUuid, d.name]));
    return [
        ...getAncestorUuids(
            departmentUuid,
            getParentMap(departments),
        ).reverse(),
        departmentUuid,
    ]
        .map((uuid) => names.get(uuid) ?? '')
        .join(' / ');
};

export const getParentOptions = (
    departments: NamedDepartment[],
    departmentUuid: string | null,
): { value: string; label: string }[] => {
    const excluded = new Set(
        departmentUuid === null
            ? []
            : [
                  departmentUuid,
                  ...getDescendantUuids(departmentUuid, departments),
              ],
    );
    return departments
        .filter((d) => !excluded.has(d.departmentUuid))
        .map((d) => ({
            value: d.departmentUuid,
            label: getDepartmentPathLabel(d.departmentUuid, departments),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
};

export const getResolvedMembers = (
    membership: DepartmentMembership[],
    departments: NamedDepartment[],
    departmentUuid: string,
): ResolvedMemberLine[] => {
    const names = new Map(departments.map((d) => [d.departmentUuid, d.name]));
    const subtree = new Set(getDescendantUuids(departmentUuid, departments));
    return membership.flatMap((member): ResolvedMemberLine[] => {
        if (member.resolution.kind !== 'assigned') return [];
        const resolved = member.resolution.departmentUuid;
        if (resolved === departmentUuid) return [{ member, via: null }];
        return subtree.has(resolved)
            ? [{ member, via: names.get(resolved) ?? '' }]
            : [];
    });
};

// The department page already holds its people, so the drawer need not load everyone again
export const getResolvedMembersFromDetail = (
    members: DepartmentMember[],
): ResolvedMemberLine[] =>
    members.map((member) => ({
        member,
        via: member.isDirect ? null : member.departmentName,
    }));

export const validateWholeNumber = (
    value: number | string,
    label: string,
): string | null => {
    if (value === '') return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && number <= MAX_WHOLE_NUMBER
        ? null
        : `${label} must be a whole number from 0 to ${formatCount(MAX_WHOLE_NUMBER)}`;
};

// Omitted field = unchanged, null = cleared
export const buildDepartmentUpdate = (
    current: CreateDepartment,
    next: CreateDepartment,
): UpdateDepartment => {
    const update: UpdateDepartment = {};
    if (next.name !== current.name) update.name = next.name;
    if (next.parentDepartmentUuid !== current.parentDepartmentUuid)
        update.parentDepartmentUuid = next.parentDepartmentUuid;
    if (next.headcount !== current.headcount) update.headcount = next.headcount;
    if (next.headcountNote !== current.headcountNote)
        update.headcountNote = next.headcountNote;
    if (next.targetActiveUsers !== current.targetActiveUsers)
        update.targetActiveUsers = next.targetActiveUsers;
    if (next.targetDate !== current.targetDate)
        update.targetDate = next.targetDate;
    return update;
};
