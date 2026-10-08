import {
    OrganizationMemberRole,
    type DepartmentMembership,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildDepartmentUpdate,
    cleanHeadcountNote,
    decodeOwners,
    encodeOwner,
    formatTargetDate,
    getAssignableUsers,
    getDepartmentPathLabel,
    getParentOptions,
    getResolvedMembers,
    toNullableNumber,
    validateWholeNumber,
} from './departmentForm';

const departments = [
    { departmentUuid: 'ops', parentDepartmentUuid: null, name: 'Operations' },
    { departmentUuid: 'stores', parentDepartmentUuid: 'ops', name: 'Stores' },
    { departmentUuid: 'north', parentDepartmentUuid: 'stores', name: 'North' },
    { departmentUuid: 'fin', parentDepartmentUuid: null, name: 'Finance' },
];

const member = (
    userUuid: string,
    departmentUuid: string | null,
): DepartmentMembership => ({
    userUuid,
    email: `${userUuid}@example.com`,
    firstName: userUuid,
    lastName: 'L',
    role: OrganizationMemberRole.VIEWER,
    resolution:
        departmentUuid === null
            ? { kind: 'unassigned' }
            : {
                  kind: 'assigned',
                  departmentUuid,
                  source: 'explicit',
                  sourceGroupName: null,
              },
});

describe('owner encoding', () => {
    it('round-trips users and groups in order', () => {
        const owners = [
            { type: 'group' as const, uuid: 'g-1' },
            { type: 'user' as const, uuid: 'u-1' },
        ];
        expect(decodeOwners(owners.map(encodeOwner))).toEqual(owners);
    });
    it('drops values it does not recognise', () => {
        expect(decodeOwners(['team:x', 'user:', 'nonsense'])).toEqual([]);
    });
});

describe('toNullableNumber', () => {
    it('maps an empty input to null and keeps zero', () => {
        expect(toNullableNumber('')).toBeNull();
        expect(toNullableNumber(0)).toBe(0);
        expect(toNullableNumber('12')).toBe(12);
    });
});

describe('getAssignableUsers', () => {
    const user = (userUuid: string, isActive: boolean, isPending: boolean) => ({
        userUuid,
        isActive,
        isPending,
    });
    it('offers people on Lightdash, plus anyone already chosen', () => {
        const users = [
            user('on', true, false),
            user('deactivated', false, false),
            user('invited', true, true),
            user('chosen', false, false),
        ];
        expect(
            getAssignableUsers(users, new Set(['chosen'])).map(
                (u) => u.userUuid,
            ),
        ).toEqual(['on', 'chosen']);
    });
});

describe('cleanHeadcountNote', () => {
    it('puts the note on one line and maps an empty note to null', () => {
        expect(cleanHeadcountNote(' Store managers\n\tand buyers ')).toBe(
            'Store managers and buyers',
        );
        expect(cleanHeadcountNote(' \n ')).toBeNull();
    });
});

describe('getDepartmentPathLabel', () => {
    it('joins ancestors from the top down', () => {
        expect(getDepartmentPathLabel('north', departments)).toBe(
            'Operations / Stores / North',
        );
        expect(getDepartmentPathLabel('fin', departments)).toBe('Finance');
    });
});

describe('getParentOptions', () => {
    it('offers every department when creating', () => {
        expect(getParentOptions(departments, null).map((o) => o.value)).toEqual(
            ['fin', 'ops', 'stores', 'north'],
        );
    });
    it('excludes the department itself and its whole subtree', () => {
        expect(
            getParentOptions(departments, 'ops').map((o) => o.value),
        ).toEqual(['fin']);
        expect(
            getParentOptions(departments, 'stores').map((o) => o.value),
        ).toEqual(['fin', 'ops']);
    });
});

describe('getResolvedMembers', () => {
    const membership = [
        member('direct', 'ops'),
        member('deep', 'north'),
        member('other', 'fin'),
        member('nobody', null),
    ];
    it('labels direct members and members who come through a sub-department', () => {
        expect(
            getResolvedMembers(membership, departments, 'ops').map((line) => [
                line.member.userUuid,
                line.via,
            ]),
        ).toEqual([
            ['direct', null],
            ['deep', 'North'],
        ]);
    });
    it('returns nobody for a department without members', () => {
        expect(
            getResolvedMembers(membership, departments, 'stores'),
        ).toHaveLength(1);
        expect(getResolvedMembers([], departments, 'ops')).toEqual([]);
    });
});

describe('formatTargetDate', () => {
    it('uses the local calendar day, never the UTC day', () => {
        expect(formatTargetDate(new Date(2026, 9, 7, 23, 59, 59))).toBe(
            '2026-10-07',
        );
        expect(formatTargetDate(new Date(2026, 0, 1, 0, 0, 1))).toBe(
            '2026-01-01',
        );
    });
    it('passes a calendar day string through and maps empty to null', () => {
        expect(formatTargetDate('2026-10-07')).toBe('2026-10-07');
        expect(formatTargetDate(null)).toBeNull();
        expect(formatTargetDate('')).toBeNull();
        expect(formatTargetDate(new Date('invalid'))).toBeNull();
    });
});

describe('validateWholeNumber', () => {
    it('accepts empty and whole numbers within range', () => {
        expect(validateWholeNumber('', 'Headcount')).toBeNull();
        expect(validateWholeNumber(0, 'Headcount')).toBeNull();
        expect(validateWholeNumber(2147483647, 'Headcount')).toBeNull();
    });
    it('rejects fractions, negatives and values past the limit', () => {
        expect(validateWholeNumber(1.5, 'Headcount')).toMatch(/Headcount/);
        expect(validateWholeNumber(-1, 'Headcount')).toMatch(/Headcount/);
        expect(validateWholeNumber(2147483648, 'Headcount')).toMatch(
            /Headcount/,
        );
    });
});

describe('buildDepartmentUpdate', () => {
    const current = {
        name: 'Ops',
        parentDepartmentUuid: 'fin',
        headcount: 40,
        headcountNote: 'Managers',
        targetActiveUsers: 30,
        targetDate: '2026-12-01',
    };
    it('sends nothing when nothing changed', () => {
        expect(buildDepartmentUpdate(current, { ...current })).toEqual({});
    });
    it('sends only changed fields and null for cleared ones', () => {
        expect(
            buildDepartmentUpdate(current, {
                ...current,
                name: 'Operations',
                headcount: null,
                parentDepartmentUuid: null,
            }),
        ).toEqual({
            name: 'Operations',
            headcount: null,
            parentDepartmentUuid: null,
        });
    });
});
