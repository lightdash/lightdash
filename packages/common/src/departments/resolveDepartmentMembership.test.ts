import { describe, expect, it } from 'vitest';
import {
    type DepartmentMembership,
    type MembershipResolution,
    type ResolvedMemberRow,
} from '../types/departments';
import { OrganizationMemberRole } from '../types/organizationMemberProfile';
import {
    getAncestorUuids,
    getParentMap,
    rollUpByDepartment,
    type DepartmentTreeNode,
} from './departmentTree';
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
            expect(member.resolution).toMatchObject({
                kind: 'assigned',
                departmentUuid: 'd4999',
            }),
        );
    });

    it('reports a conflict between siblings on a 5,000-wide level', () => {
        const [conflict, single] = resolveDepartmentMembership(
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
        expect(conflict.resolution).toEqual({
            kind: 'conflict',
            departmentUuids: ['c0001', 'c4999'],
        });
        expect(single.resolution).toMatchObject({
            kind: 'assigned',
            departmentUuid: 'c0042',
        });
    });
});

// The pairwise version the one-pass collapse replaced, kept to prove they give the same answers
const pairwiseResolveOne = (
    member: ResolvedMemberRow,
    ancestorsOf: (departmentUuid: string) => Set<string>,
): MembershipResolution => {
    if (member.explicitDepartmentUuid !== null) {
        return {
            kind: 'assigned',
            departmentUuid: member.explicitDepartmentUuid,
            source: 'explicit',
            sourceGroupName: null,
        };
    }
    const candidates = Array.from(
        new Set(member.groupLinks.map((l) => l.departmentUuid)),
    ).sort();
    const mostSpecific =
        candidates.length < 2
            ? candidates
            : candidates.filter(
                  (c) =>
                      !candidates.some(
                          (other) => other !== c && ancestorsOf(other).has(c),
                      ),
              );
    if (mostSpecific.length === 1) {
        const [departmentUuid] = mostSpecific;
        const [firstGroupName] = member.groupLinks
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

const pairwiseResolveDepartmentMembership = (
    rows: ResolvedMemberRow[],
    nodes: DepartmentTreeNode[],
): DepartmentMembership[] => {
    const parentMap = getParentMap(nodes);
    const ancestorSets = new Map<string, Set<string>>();
    const ancestorsOf = (departmentUuid: string): Set<string> => {
        const known = ancestorSets.get(departmentUuid);
        if (known) return known;
        const ancestors = new Set(getAncestorUuids(departmentUuid, parentMap));
        ancestorSets.set(departmentUuid, ancestors);
        return ancestors;
    };
    return rows.map((member) => ({
        userUuid: member.userUuid,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        role: member.role,
        resolution: pairwiseResolveOne(member, ancestorsOf),
    }));
};

describe('one-pass collapse matches the pairwise one', () => {
    // Small seeded generator, so a failure always reproduces
    const random = (seed: number) => {
        // Spread small seeds out, or the first draws would all be near zero
        let state = (seed * 7919 + 104729) % 2147483647;
        return () => {
            // Park-Miller: the product stays below 2^53, so every step is exact
            state = (state * 48271) % 2147483647;
            return state / 2147483647;
        };
    };
    const randomCase = (seed: number) => {
        const next = random(seed);
        const pick = <T>(items: T[]): T =>
            items[Math.floor(next() * items.length)];
        const size = 1 + Math.floor(next() * 25);
        const uuids = Array.from({ length: size }, (_, i) => `n${i}`);
        // Parents at random: top level, missing, or any department, which makes cycles and self-parents
        const pickParent = (): string | null => {
            const roll = next();
            if (roll < 0.25) return null;
            if (roll < 0.3) return 'gone';
            return pick(uuids);
        };
        const tree: DepartmentTreeNode[] = uuids.map((departmentUuid) => ({
            departmentUuid,
            parentDepartmentUuid: pickParent(),
        }));
        // Links may name a department outside the tree, or one department through two groups
        const targets = [...uuids, 'gone'];
        const rows = Array.from(
            { length: 1 + Math.floor(next() * 8) },
            (_, i) =>
                row({
                    userUuid: `u${i}`,
                    explicitDepartmentUuid:
                        next() < 0.15 ? pick(targets) : null,
                    groupLinks: Array.from(
                        { length: Math.floor(next() * 7) },
                        () => {
                            const departmentUuid = pick(targets);
                            return {
                                departmentUuid,
                                groupUuid: `g-${departmentUuid}`,
                                groupName: pick(['A', 'B', 'C']),
                            };
                        },
                    ),
                }),
        );
        return { tree, rows };
    };
    const SEEDS = Array.from({ length: 400 }, (_, seed) => seed + 1);

    it.each(SEEDS)('resolves random case %i the same way', (seed) => {
        const { tree, rows } = randomCase(seed);
        expect(resolveDepartmentMembership(rows, tree)).toEqual(
            pairwiseResolveDepartmentMembership(rows, tree),
        );
    });

    it('draws self-parents, longer cycles, conflicts and dropped ancestors among the cases', () => {
        const seen = { selfParent: 0, cycle: 0, conflict: 0, dropped: 0 };
        SEEDS.forEach((seed) => {
            const { tree, rows } = randomCase(seed);
            const parentMap = getParentMap(tree);
            if (tree.some((n) => n.parentDepartmentUuid === n.departmentUuid)) {
                seen.selfParent += 1;
            }
            // A walk that comes back to where it started after two or more steps
            const isInLongerCycle = (start: string) => {
                let current = parentMap.get(start) ?? null;
                for (let step = 1; step <= tree.length; step += 1) {
                    if (current === null) return false;
                    if (current === start) return step > 1;
                    current = parentMap.get(current) ?? null;
                }
                return false;
            };
            if (tree.some((n) => isInLongerCycle(n.departmentUuid))) {
                seen.cycle += 1;
            }
            resolveDepartmentMembership(rows, tree).forEach(
                ({ resolution }, i) => {
                    if (rows[i].explicitDepartmentUuid !== null) return;
                    const candidates = new Set(
                        rows[i].groupLinks.map((l) => l.departmentUuid),
                    ).size;
                    const kept =
                        resolution.kind === 'conflict'
                            ? resolution.departmentUuids.length
                            : Number(resolution.kind === 'assigned');
                    if (resolution.kind === 'conflict') seen.conflict += 1;
                    if (kept < candidates) seen.dropped += 1;
                },
            );
        });
        expect(seen.selfParent).toBeGreaterThan(0);
        expect(seen.cycle).toBeGreaterThan(0);
        expect(seen.conflict).toBeGreaterThan(0);
        expect(seen.dropped).toBeGreaterThan(0);
    });
});

describe('resolution when one person is in very many linked groups', () => {
    it('resolves 300 people each in all 999 sub-departments of one root in under 200 ms', () => {
        const subDepartments = Array.from(
            { length: 999 },
            (_, i) => `s${String(i).padStart(3, '0')}`,
        );
        const flat = [
            { departmentUuid: 'root', parentDepartmentUuid: null },
            ...subDepartments.map((departmentUuid) => ({
                departmentUuid,
                parentDepartmentUuid: 'root',
            })),
        ];
        // One group per sub-department, and everyone in every group
        const rows = Array.from({ length: 300 }, (_, i) =>
            row({
                userUuid: `u${i}`,
                groupLinks: subDepartments.map((departmentUuid) =>
                    link(departmentUuid),
                ),
            }),
        );

        // The fastest of five runs, so a busy machine does not fail it
        const fastest = Math.min(
            ...Array.from({ length: 5 }, () => {
                const started = performance.now();
                resolveDepartmentMembership(rows, flat);
                return performance.now() - started;
            }),
        );
        const resolved = resolveDepartmentMembership(rows, flat);

        expect(fastest).toBeLessThan(200);
        expect(resolved).toHaveLength(300);
        resolved.forEach((member) =>
            expect(member.resolution).toEqual({
                kind: 'conflict',
                departmentUuids: subDepartments,
            }),
        );
    });
});
