import {
    OrganizationMemberRole,
    type DepartmentMembership,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { memberFixture } from './adoptionFixtures';
import {
    buildDepartmentUpdate,
    cleanHeadcountNote,
    decodeOwners,
    encodeOwner,
    getAlsoIn,
    getAssignableUsers,
    getDepartmentPathLabel,
    getParentOptions,
    getResolvedMembers,
    placementsFromDetail,
    placementsFromMembership,
    toNullableNumber,
    validateWholeNumber,
} from './departmentForm';

const departments = [
    { departmentUuid: 'ops', parentDepartmentUuid: null, name: 'Operations' },
    { departmentUuid: 'stores', parentDepartmentUuid: 'ops', name: 'Stores' },
    { departmentUuid: 'north', parentDepartmentUuid: 'stores', name: 'North' },
    { departmentUuid: 'fin', parentDepartmentUuid: null, name: 'Finance' },
];
const withDepots = [
    ...departments,
    { departmentUuid: 'depots', parentDepartmentUuid: 'ops', name: 'Depots' },
    { departmentUuid: 'data', parentDepartmentUuid: null, name: 'Data' },
];

// Placements are given in uuid order, as the server sorts them
const member = (
    userUuid: string,
    placedIn: string[],
    primaryDepartmentUuid: string | null = null,
): DepartmentMembership => ({
    userUuid,
    email: `${userUuid}@example.com`,
    firstName: userUuid,
    lastName: 'L',
    role: OrganizationMemberRole.VIEWER,
    kind:
        placedIn.length === 0
            ? 'unassigned'
            : placedIn.length === 1
              ? 'assigned'
              : 'shared',
    placements: placedIn.map((departmentUuid) => ({
        departmentUuid,
        source: 'explicit',
        sourceGroupName: null,
    })),
    primaryDepartmentUuid,
    countedDepartmentUuids:
        primaryDepartmentUuid === null ? placedIn : [primaryDepartmentUuid],
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
        member('direct', ['ops']),
        member('deep', ['north']),
        member('other', ['fin']),
        member('nobody', []),
        member('shared', ['fin', 'stores']),
        member('countsElsewhere', ['fin', 'stores'], 'fin'),
        member('countsHere', ['fin', 'ops'], 'ops'),
    ];
    const lines = (departmentUuid: string, people = membership) =>
        getResolvedMembers(people, withDepots, departmentUuid).map((line) => [
            line.member.userUuid,
            line.via,
        ]);
    it('labels direct members and members who come through a sub-department', () => {
        expect(lines('ops')).toEqual([
            ['direct', null],
            ['deep', 'North'],
            ['shared', 'Stores'],
            ['countsHere', null],
        ]);
    });
    it('lists people only where they count, so a chosen department elsewhere leaves them out', () => {
        expect(lines('stores')).toEqual([
            ['deep', 'North'],
            ['shared', null],
        ]);
        expect(lines('fin').map(([userUuid]) => userUuid)).toEqual([
            'other',
            'shared',
            'countsElsewhere',
        ]);
    });
    it('comes through the first of their sub-departments, as the department page does', () => {
        expect(lines('ops', [member('both', ['depots', 'stores'])])).toEqual([
            ['both', 'Depots'],
        ]);
    });
    it('returns nobody for a department without members', () => {
        expect(lines('data')).toEqual([]);
        expect(getResolvedMembers([], departments, 'ops')).toEqual([]);
    });
});

describe('getAlsoIn', () => {
    const alsoIn = (
        departmentUuids: string[],
        line: {
            departmentUuid: string | null;
            parentDepartmentUuid: string | null;
        },
    ) =>
        getAlsoIn([{ userUuid: 'u1', departmentUuids }], withDepots, line).get(
            'u1',
        );
    const STORES = { departmentUuid: 'stores', parentDepartmentUuid: 'ops' };

    it('names the other departments a person is in, by name', () => {
        expect(alsoIn(['data', 'fin', 'stores'], STORES)).toEqual([
            'Data',
            'Finance',
        ]);
        expect(alsoIn(['depots', 'fin'], STORES)).toEqual([
            'Depots',
            'Finance',
        ]);
    });
    it('leaves out the departments above and below this one, which already hold it', () => {
        expect(alsoIn(['fin', 'north'], STORES)).toEqual(['Finance']);
        expect(alsoIn(['ops'], STORES)).toBeUndefined();
        expect(alsoIn(['north'], STORES)).toBeUndefined();
    });
    it('reads the line from the chosen parent, so a new department leaves out the parent and above', () => {
        const NEW_UNDER_STORES = {
            departmentUuid: null,
            parentDepartmentUuid: 'stores',
        };
        expect(alsoIn(['fin', 'ops'], NEW_UNDER_STORES)).toEqual(['Finance']);
        expect(alsoIn(['north'], NEW_UNDER_STORES)).toEqual(['North']);
        expect(
            alsoIn(['fin', 'ops'], {
                departmentUuid: null,
                parentDepartmentUuid: null,
            }),
        ).toEqual(['Finance', 'Operations']);
    });
    it('leaves out people in nowhere else and departments it does not know', () => {
        expect(alsoIn([], STORES)).toBeUndefined();
        expect(alsoIn(['gone', 'fin'], STORES)).toEqual(['Finance']);
    });
});

describe('placements for also in', () => {
    it('reads every placement from the membership list', () => {
        expect(
            placementsFromMembership([
                member('shared', ['fin', 'stores'], 'fin'),
                member('nobody', []),
            ]),
        ).toEqual([
            { userUuid: 'shared', departmentUuids: ['fin', 'stores'] },
            { userUuid: 'nobody', departmentUuids: [] },
        ]);
    });
    it("reads a department page's people from where they count and who they are shared with", () => {
        expect(
            placementsFromDetail([
                memberFixture('shared', null, {
                    departmentUuid: 'stores',
                    sharedWith: [{ departmentUuid: 'fin', name: 'Finance' }],
                }),
            ]),
        ).toEqual([{ userUuid: 'shared', departmentUuids: ['stores', 'fin'] }]);
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
