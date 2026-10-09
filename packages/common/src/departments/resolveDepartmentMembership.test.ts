import { describe, expect, it } from 'vitest';
import { type ResolvedMemberRow } from '../types/departments';
import { OrganizationMemberRole } from '../types/organizationMemberProfile';
import { rollUpByDepartment } from './departmentTree';
import {
    getDirectMembersByDepartment,
    resolveDepartmentMembership,
} from './resolveDepartmentMembership';

// ops ─┬─ stores ── north
//      └─ depots
// finance
const departments = [
    { departmentUuid: 'ops', parentDepartmentUuid: null },
    { departmentUuid: 'stores', parentDepartmentUuid: 'ops' },
    { departmentUuid: 'north', parentDepartmentUuid: 'stores' },
    { departmentUuid: 'depots', parentDepartmentUuid: 'ops' },
    { departmentUuid: 'finance', parentDepartmentUuid: null },
];

const link = (
    departmentUuid: string,
    groupName = `${departmentUuid} group`,
) => ({
    departmentUuid,
    groupUuid: `g-${departmentUuid}`,
    groupName,
});

const row = (over: Partial<ResolvedMemberRow>): ResolvedMemberRow => ({
    userUuid: 'u1',
    email: 'a@b.c',
    firstName: 'A',
    lastName: 'B',
    role: OrganizationMemberRole.VIEWER,
    explicitDepartmentUuid: null,
    groupLinks: [],
    ...over,
});

const resolve = (over: Partial<ResolvedMemberRow>) =>
    resolveDepartmentMembership([row(over)], departments)[0].resolution;

describe('resolveDepartmentMembership', () => {
    it('explicit assignment wins over groups and is not a conflict', () => {
        expect(
            resolve({
                explicitDepartmentUuid: 'finance',
                groupLinks: [link('stores'), link('depots')],
            }),
        ).toEqual({
            kind: 'assigned',
            departmentUuid: 'finance',
            source: 'explicit',
            sourceGroupName: null,
        });
    });
    it('a single group department assigns by group and names the group', () => {
        expect(
            resolve({ groupLinks: [link('depots', 'Depot staff')] }),
        ).toEqual({
            kind: 'assigned',
            departmentUuid: 'depots',
            source: 'group',
            sourceGroupName: 'Depot staff',
        });
    });
    it('the same department through two groups is still assigned', () => {
        const resolution = resolve({
            groupLinks: [link('depots', 'B team'), link('depots', 'A team')],
        });
        expect(resolution).toMatchObject({
            kind: 'assigned',
            departmentUuid: 'depots',
            sourceGroupName: 'A team',
        });
    });
    it('a child beats its parent', () => {
        expect(
            resolve({ groupLinks: [link('ops'), link('stores')] }),
        ).toMatchObject({ kind: 'assigned', departmentUuid: 'stores' });
    });
    it('a grandchild beats both ancestors', () => {
        expect(
            resolve({
                groupLinks: [link('ops'), link('stores'), link('north')],
            }),
        ).toMatchObject({ kind: 'assigned', departmentUuid: 'north' });
    });
    it('two departments in different branches conflict', () => {
        expect(
            resolve({ groupLinks: [link('stores'), link('depots')] }),
        ).toEqual({ kind: 'conflict', departmentUuids: ['depots', 'stores'] });
    });
    it('an ancestor is dropped before the conflict is reported', () => {
        expect(
            resolve({
                groupLinks: [link('ops'), link('north'), link('finance')],
            }),
        ).toEqual({ kind: 'conflict', departmentUuids: ['finance', 'north'] });
    });
    it('no departments is unassigned', () => {
        expect(resolve({})).toEqual({ kind: 'unassigned' });
    });
    it('passes identity fields through', () => {
        const [member] = resolveDepartmentMembership(
            [row({ userUuid: 'x', email: 'x@y.z' })],
            departments,
        );
        expect(member).toMatchObject({
            userUuid: 'x',
            email: 'x@y.z',
            role: OrganizationMemberRole.VIEWER,
        });
    });
});

describe('roll-up of resolved members', () => {
    it('counts a user in parent and child groups once, in the child, and once in the parent roll-up', () => {
        const membership = resolveDepartmentMembership(
            [
                row({
                    userUuid: 'both',
                    groupLinks: [link('ops'), link('stores')],
                }),
                row({ userUuid: 'top', groupLinks: [link('ops')] }),
                row({
                    userUuid: 'clash',
                    groupLinks: [link('stores'), link('finance')],
                }),
            ],
            departments,
        );
        const direct = getDirectMembersByDepartment(membership);
        expect(direct.get('stores')?.map((m) => m.userUuid)).toEqual(['both']);
        expect(direct.get('ops')?.map((m) => m.userUuid)).toEqual(['top']);

        const rolled = rollUpByDepartment(departments, direct);
        expect(
            rolled
                .get('ops')
                ?.map((m) => m.userUuid)
                .sort(),
        ).toEqual(['both', 'top']);
        // A conflicted user is counted nowhere
        expect(rolled.get('finance')).toEqual([]);
    });
});
