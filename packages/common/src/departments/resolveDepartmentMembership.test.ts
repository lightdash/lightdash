import { describe, expect, it } from 'vitest';
import {
    type MembershipPlacement,
    type ResolvedMemberRow,
} from '../types/departments';
import { OrganizationMemberRole } from '../types/organizationMemberProfile';
import { rollUpByDepartment } from './departmentTree';
import {
    getDirectMembersByDepartment,
    resolveDepartmentMembership,
} from './resolveDepartmentMembership';

// ops ─┬─ stores ── north
//      └─ depots
// finance
// sales ── enterprise
// marketing
const departments = [
    { departmentUuid: 'ops', parentDepartmentUuid: null },
    { departmentUuid: 'stores', parentDepartmentUuid: 'ops' },
    { departmentUuid: 'north', parentDepartmentUuid: 'stores' },
    { departmentUuid: 'depots', parentDepartmentUuid: 'ops' },
    { departmentUuid: 'finance', parentDepartmentUuid: null },
    { departmentUuid: 'sales', parentDepartmentUuid: null },
    { departmentUuid: 'enterprise', parentDepartmentUuid: 'sales' },
    { departmentUuid: 'marketing', parentDepartmentUuid: null },
];

// The organization as one root above every top-level department
const organizationTree = [
    { departmentUuid: 'organization', parentDepartmentUuid: null },
    ...departments.map((d) => ({
        ...d,
        parentDepartmentUuid: d.parentDepartmentUuid ?? 'organization',
    })),
];

const link = (
    departmentUuid: string,
    groupName = `${departmentUuid} group`,
) => ({
    departmentUuid,
    groupUuid: `g-${groupName}`,
    groupName,
});

const explicit = (departmentUuid: string): MembershipPlacement => ({
    departmentUuid,
    source: 'explicit',
    sourceGroupName: null,
});

const viaGroup = (
    departmentUuid: string,
    groupName = `${departmentUuid} group`,
): MembershipPlacement => ({
    departmentUuid,
    source: 'group',
    sourceGroupName: groupName,
});

const row = (over: Partial<ResolvedMemberRow>): ResolvedMemberRow => ({
    userUuid: 'u1',
    email: 'a@b.c',
    firstName: 'A',
    lastName: 'B',
    role: OrganizationMemberRole.VIEWER,
    explicitDepartmentUuids: [],
    groupLinks: [],
    primaryDepartmentUuid: null,
    ...over,
});

const resolve = (over: Partial<ResolvedMemberRow>) => {
    const [member] = resolveDepartmentMembership([row(over)], departments);
    return {
        kind: member.kind,
        placements: member.placements,
        primaryDepartmentUuid: member.primaryDepartmentUuid,
        countedDepartmentUuids: member.countedDepartmentUuids,
    };
};

const userUuidsIn = (
    direct: Map<string, { userUuid: string }[]>,
    departmentUuid: string,
) => direct.get(departmentUuid)?.map((m) => m.userUuid);

describe('resolveDepartmentMembership', () => {
    it('no departments is unassigned and counts nowhere', () => {
        expect(resolve({})).toEqual({
            kind: 'unassigned',
            placements: [],
            primaryDepartmentUuid: null,
            countedDepartmentUuids: [],
        });
    });
    it('a single group department is assigned and names the group', () => {
        expect(
            resolve({ groupLinks: [link('depots', 'Depot staff')] }),
        ).toEqual({
            kind: 'assigned',
            placements: [viaGroup('depots', 'Depot staff')],
            primaryDepartmentUuid: null,
            countedDepartmentUuids: ['depots'],
        });
    });
    it('the same department through two groups is one placement named after the first group by name', () => {
        expect(
            resolve({
                groupLinks: [
                    link('depots', 'B team'),
                    link('depots', 'A team'),
                ],
            }).placements,
        ).toEqual([viaGroup('depots', 'A team')]);
    });
    it('a child beats its parent', () => {
        expect(
            resolve({ groupLinks: [link('ops'), link('stores')] }).placements,
        ).toEqual([viaGroup('stores')]);
    });
    it('a grandchild beats both ancestors', () => {
        expect(
            resolve({
                groupLinks: [link('ops'), link('stores'), link('north')],
            }).placements,
        ).toEqual([viaGroup('north')]);
    });
    it('groups in two branches make the person shared and counted in both', () => {
        expect(
            resolve({ groupLinks: [link('stores'), link('depots')] }),
        ).toEqual({
            kind: 'shared',
            placements: [viaGroup('depots'), viaGroup('stores')],
            primaryDepartmentUuid: null,
            countedDepartmentUuids: ['depots', 'stores'],
        });
    });
    it('an ancestor is dropped before the kind is decided', () => {
        expect(
            resolve({
                groupLinks: [link('ops'), link('north'), link('finance')],
            }),
        ).toMatchObject({
            kind: 'shared',
            placements: [viaGroup('finance'), viaGroup('north')],
        });
    });
    it('a stored cycle keeps both departments instead of leaving the person unassigned', () => {
        const [member] = resolveDepartmentMembership(
            [row({ explicitDepartmentUuids: ['a'], groupLinks: [link('b')] })],
            [
                { departmentUuid: 'a', parentDepartmentUuid: 'b' },
                { departmentUuid: 'b', parentDepartmentUuid: 'a' },
            ],
        );
        expect(member).toMatchObject({
            kind: 'shared',
            placements: [explicit('a'), viaGroup('b')],
            countedDepartmentUuids: ['a', 'b'],
        });
    });
    it('explicit in two unrelated departments is shared', () => {
        expect(
            resolve({ explicitDepartmentUuids: ['marketing', 'finance'] }),
        ).toEqual({
            kind: 'shared',
            placements: [explicit('finance'), explicit('marketing')],
            primaryDepartmentUuid: null,
            countedDepartmentUuids: ['finance', 'marketing'],
        });
    });
    it('explicit in a parent and a group in its child collapses to the child', () => {
        expect(
            resolve({
                explicitDepartmentUuids: ['ops'],
                groupLinks: [link('stores', 'Store staff')],
            }),
        ).toEqual({
            kind: 'assigned',
            placements: [viaGroup('stores', 'Store staff')],
            primaryDepartmentUuid: null,
            countedDepartmentUuids: ['stores'],
        });
    });
    it('explicit and a group in the same department is one explicit placement', () => {
        expect(
            resolve({
                explicitDepartmentUuids: ['depots'],
                groupLinks: [link('depots')],
            }),
        ).toEqual({
            kind: 'assigned',
            placements: [explicit('depots')],
            primaryDepartmentUuid: null,
            countedDepartmentUuids: ['depots'],
        });
    });
    it('a primary that is a placement is the only department counted', () => {
        expect(
            resolve({
                explicitDepartmentUuids: ['marketing'],
                groupLinks: [link('sales', 'sales-all')],
                primaryDepartmentUuid: 'marketing',
            }),
        ).toEqual({
            kind: 'shared',
            placements: [explicit('marketing'), viaGroup('sales', 'sales-all')],
            primaryDepartmentUuid: 'marketing',
            countedDepartmentUuids: ['marketing'],
        });
    });
    it('a primary pointing at a non-placement is ignored', () => {
        expect(
            resolve({
                groupLinks: [link('stores'), link('depots')],
                primaryDepartmentUuid: 'finance',
            }),
        ).toEqual({
            kind: 'shared',
            placements: [viaGroup('depots'), viaGroup('stores')],
            primaryDepartmentUuid: null,
            countedDepartmentUuids: ['depots', 'stores'],
        });
    });
    it('a primary on a department dropped as an ancestor is ignored', () => {
        expect(
            resolve({
                explicitDepartmentUuids: ['ops'],
                groupLinks: [link('stores'), link('finance')],
                primaryDepartmentUuid: 'ops',
            }),
        ).toEqual({
            kind: 'shared',
            placements: [viaGroup('finance'), viaGroup('stores')],
            primaryDepartmentUuid: null,
            countedDepartmentUuids: ['finance', 'stores'],
        });
    });
    it('passes identity fields through', () => {
        const [member] = resolveDepartmentMembership(
            [row({ userUuid: 'x', email: 'x@y.z' })],
            departments,
        );
        expect(member).toMatchObject({
            userUuid: 'x',
            email: 'x@y.z',
            firstName: 'A',
            lastName: 'B',
            role: OrganizationMemberRole.VIEWER,
        });
    });
    it('completes on a 5,000-deep chain and keeps the deepest placement', () => {
        const chain = Array.from({ length: 5000 }, (_, i) => ({
            departmentUuid: `d${i}`,
            parentDepartmentUuid: i === 0 ? null : `d${i - 1}`,
        }));
        const [member] = resolveDepartmentMembership(
            [
                row({
                    explicitDepartmentUuids: ['d0'],
                    groupLinks: [link('d2500'), link('d4999')],
                    primaryDepartmentUuid: 'd0',
                }),
            ],
            chain,
        );
        expect(member).toMatchObject({
            kind: 'assigned',
            placements: [viaGroup('d4999')],
            primaryDepartmentUuid: null,
            countedDepartmentUuids: ['d4999'],
        });
    });
});

describe('counting resolved members', () => {
    it('a person in sales-all and sales-enterprise is placed in Enterprise Sales only and counts once in the Sales roll-up', () => {
        const membership = resolveDepartmentMembership(
            [
                row({
                    userUuid: 'p',
                    groupLinks: [
                        link('sales', 'sales-all'),
                        link('enterprise', 'sales-enterprise'),
                    ],
                }),
            ],
            departments,
        );
        expect(membership[0]).toMatchObject({
            kind: 'assigned',
            placements: [viaGroup('enterprise', 'sales-enterprise')],
            countedDepartmentUuids: ['enterprise'],
        });
        const direct = getDirectMembersByDepartment(membership);
        expect(direct.has('sales')).toBe(false);
        expect(userUuidsIn(direct, 'enterprise')).toEqual(['p']);
        expect(
            userUuidsIn(rollUpByDepartment(departments, direct), 'sales'),
        ).toEqual(['p']);
    });
    it('a person explicitly in Marketing and via a group in Sales is shared, counts in both and once in the organization', () => {
        const membership = resolveDepartmentMembership(
            [
                row({
                    userUuid: 'both',
                    explicitDepartmentUuids: ['marketing'],
                    groupLinks: [link('sales', 'sales-all')],
                }),
                row({ userUuid: 'm', explicitDepartmentUuids: ['marketing'] }),
                row({
                    userUuid: 's',
                    groupLinks: [link('sales', 'sales-all')],
                }),
                row({ userUuid: 'none' }),
            ],
            departments,
        );
        expect(membership[0]).toMatchObject({
            kind: 'shared',
            countedDepartmentUuids: ['marketing', 'sales'],
        });
        const direct = getDirectMembersByDepartment(membership);
        expect(userUuidsIn(direct, 'marketing')).toEqual(['both', 'm']);
        expect(userUuidsIn(direct, 'sales')).toEqual(['both', 's']);
        expect(
            userUuidsIn(
                rollUpByDepartment(organizationTree, direct),
                'organization',
            )?.sort(),
        ).toEqual(['both', 'm', 's']);
    });
    it('a person counted in two sibling departments is once in the parent roll-up and once in the organization total', () => {
        const direct = getDirectMembersByDepartment(
            resolveDepartmentMembership(
                [
                    row({
                        userUuid: 'p',
                        groupLinks: [link('stores'), link('depots')],
                    }),
                    row({ userUuid: 'q', groupLinks: [link('north')] }),
                ],
                departments,
            ),
        );
        expect(userUuidsIn(direct, 'stores')).toEqual(['p']);
        expect(userUuidsIn(direct, 'depots')).toEqual(['p']);
        expect(
            userUuidsIn(rollUpByDepartment(departments, direct), 'ops'),
        ).toEqual(['p', 'q']);
        expect(
            userUuidsIn(
                rollUpByDepartment(organizationTree, direct),
                'organization',
            ),
        ).toEqual(['p', 'q']);
    });
    it('clearing the primary, or losing its department, restores counting in every placement', () => {
        const placedIn = {
            explicitDepartmentUuids: ['marketing', 'finance'],
            groupLinks: [link('sales', 'sales-all')],
        };
        expect(
            resolve({ ...placedIn, primaryDepartmentUuid: 'marketing' })
                .countedDepartmentUuids,
        ).toEqual(['marketing']);
        expect(
            resolve({ ...placedIn, primaryDepartmentUuid: null })
                .countedDepartmentUuids,
        ).toEqual(['finance', 'marketing', 'sales']);
        // Marketing deleted: its explicit row is gone even if a stale primary is not
        expect(
            resolve({
                ...placedIn,
                explicitDepartmentUuids: ['finance'],
                primaryDepartmentUuid: 'marketing',
            }),
        ).toMatchObject({
            primaryDepartmentUuid: null,
            countedDepartmentUuids: ['finance', 'sales'],
        });
    });
    it('a person linked to every department counts only in the most specific department of each branch', () => {
        expect(
            resolve({
                explicitDepartmentUuids: ['ops', 'marketing'],
                groupLinks: departments.map((d) => link(d.departmentUuid)),
            }).countedDepartmentUuids,
        ).toEqual(['depots', 'enterprise', 'finance', 'marketing', 'north']);
    });
    it('a shared person is listed once in each department they count in', () => {
        const direct = getDirectMembersByDepartment(
            resolveDepartmentMembership(
                [
                    row({
                        userUuid: 'p',
                        explicitDepartmentUuids: ['depots', 'finance'],
                        groupLinks: [
                            link('depots', 'A team'),
                            link('depots', 'B team'),
                            link('finance'),
                        ],
                    }),
                ],
                departments,
            ),
        );
        expect(
            [...direct.entries()].map(([uuid, members]) => [
                uuid,
                members.map((m) => m.userUuid),
            ]),
        ).toEqual([
            ['depots', ['p']],
            ['finance', ['p']],
        ]);
    });
    it('a person with a primary is listed only in the primary', () => {
        const direct = getDirectMembersByDepartment(
            resolveDepartmentMembership(
                [
                    row({
                        userUuid: 'p',
                        groupLinks: [link('stores'), link('finance')],
                        primaryDepartmentUuid: 'finance',
                    }),
                ],
                departments,
            ),
        );
        expect(userUuidsIn(direct, 'finance')).toEqual(['p']);
        expect(direct.has('stores')).toBe(false);
        expect(
            userUuidsIn(rollUpByDepartment(departments, direct), 'ops'),
        ).toEqual([]);
    });
});

describe('resolution on very deep and very wide trees', () => {
    const SIZE = 5000;
    const chain = Array.from({ length: SIZE }, (_, i) => ({
        departmentUuid: `d${String(i).padStart(4, '0')}`,
        parentDepartmentUuid:
            i === 0 ? null : `d${String(i - 1).padStart(4, '0')}`,
    }));
    const wide = [
        { departmentUuid: 'root', parentDepartmentUuid: null },
        ...Array.from({ length: SIZE }, (_, i) => ({
            departmentUuid: `c${String(i).padStart(4, '0')}`,
            parentDepartmentUuid: 'root',
        })),
    ];

    it('picks the deepest department on a 5,000-deep chain for every person', () => {
        const rows = Array.from({ length: SIZE }, (_, i) =>
            row({
                userUuid: `u${i}`,
                groupLinks: [link('d0000'), link('d4999'), link('d2500')],
            }),
        );
        const resolved = resolveDepartmentMembership(rows, chain);
        expect(resolved).toHaveLength(SIZE);
        resolved.forEach((member) =>
            expect(member).toMatchObject({
                kind: 'assigned',
                countedDepartmentUuids: ['d4999'],
            }),
        );
    });

    it('shares a person between siblings on a 5,000-wide level', () => {
        const [shared, single] = resolveDepartmentMembership(
            [
                row({
                    groupLinks: [link('c4999'), link('c0001'), link('root')],
                }),
                row({
                    userUuid: 'u2',
                    groupLinks: [link('root'), link('c0042')],
                }),
            ],
            wide,
        );
        expect(shared).toMatchObject({
            kind: 'shared',
            countedDepartmentUuids: ['c0001', 'c4999'],
        });
        expect(single).toMatchObject({
            kind: 'assigned',
            countedDepartmentUuids: ['c0042'],
        });
    });
});
