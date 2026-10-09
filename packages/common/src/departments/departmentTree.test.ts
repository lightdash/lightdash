import { describe, expect, it } from 'vitest';
import {
    computeEffectiveHeadcounts,
    getAncestorUuids,
    getBranchHeight,
    getChildrenHeadcount,
    getChildrenMap,
    getDepthMap,
    getDescendantUuids,
    getParentMap,
    getResidualHeadcount,
    rollUpByDepartment,
    wouldCreateCycle,
    type DepartmentHeadcountNode,
} from './departmentTree';

// ops ─┬─ stores ── north
//      └─ depots
// finance
const nodes = [
    { departmentUuid: 'ops', parentDepartmentUuid: null },
    { departmentUuid: 'stores', parentDepartmentUuid: 'ops' },
    { departmentUuid: 'north', parentDepartmentUuid: 'stores' },
    { departmentUuid: 'depots', parentDepartmentUuid: 'ops' },
    { departmentUuid: 'finance', parentDepartmentUuid: null },
];

describe('getAncestorUuids', () => {
    it('returns ancestors nearest first', () => {
        expect(getAncestorUuids('north', getParentMap(nodes))).toEqual([
            'stores',
            'ops',
        ]);
    });
    it('returns nothing for a top-level department', () => {
        expect(getAncestorUuids('finance', getParentMap(nodes))).toEqual([]);
    });
    it('terminates on corrupt cyclic data', () => {
        const cyclic = getParentMap([
            { departmentUuid: 'a', parentDepartmentUuid: 'b' },
            { departmentUuid: 'b', parentDepartmentUuid: 'a' },
        ]);
        expect(getAncestorUuids('a', cyclic)).toEqual(['b']);
    });
});

describe('getChildrenMap', () => {
    it('groups children under their parent and top level under null', () => {
        const map = getChildrenMap(nodes);
        expect(map.get(null)).toEqual(['ops', 'finance']);
        expect(map.get('ops')).toEqual(['stores', 'depots']);
    });
    it('treats a department whose parent is missing as top level', () => {
        const map = getChildrenMap([
            { departmentUuid: 'x', parentDepartmentUuid: 'gone' },
        ]);
        expect(map.get(null)).toEqual(['x']);
    });
});

describe('getDescendantUuids', () => {
    it('returns every level below', () => {
        expect(getDescendantUuids('ops', nodes).sort()).toEqual([
            'depots',
            'north',
            'stores',
        ]);
    });
    it('returns nothing for a leaf', () => {
        expect(getDescendantUuids('north', nodes)).toEqual([]);
    });
});

describe('wouldCreateCycle', () => {
    it('rejects a department as its own parent', () => {
        expect(wouldCreateCycle(nodes, 'ops', 'ops')).toBe(true);
    });
    it('rejects moving a department under its descendant', () => {
        expect(wouldCreateCycle(nodes, 'ops', 'north')).toBe(true);
    });
    it('allows moving to another branch or to the top level', () => {
        expect(wouldCreateCycle(nodes, 'north', 'finance')).toBe(false);
        expect(wouldCreateCycle(nodes, 'north', null)).toBe(false);
    });
});

describe('computeEffectiveHeadcounts', () => {
    const withHeadcount = (headcounts: Record<string, number | null>) =>
        nodes.map((n) => ({
            ...n,
            headcount: headcounts[n.departmentUuid] ?? null,
        }));
    const NOBODY = new Map<string, number>();

    it('uses the own value when set', () => {
        const result = computeEffectiveHeadcounts(
            withHeadcount({ ops: 100, stores: 40, depots: 20 }),
            NOBODY,
        );
        expect(result.get('ops')).toEqual({
            effectiveHeadcount: 100,
            hasHeadcount: true,
            headcountBelowChildren: false,
        });
    });
    it('sums children when the own value is missing, through several levels', () => {
        const result = computeEffectiveHeadcounts(
            withHeadcount({ north: 15, depots: 20 }),
            NOBODY,
        );
        expect(result.get('stores')).toEqual({
            effectiveHeadcount: 15,
            hasHeadcount: true,
            headcountBelowChildren: false,
        });
        expect(result.get('ops')?.effectiveHeadcount).toBe(35);
    });
    it('flags an own value smaller than the children sum and counts their sum instead', () => {
        const result = computeEffectiveHeadcounts(
            withHeadcount({ ops: 30, stores: 40, depots: 20 }),
            NOBODY,
        );
        expect(result.get('ops')).toEqual({
            effectiveHeadcount: 60,
            hasHeadcount: true,
            headcountBelowChildren: true,
        });
    });
    it('never goes below its sub-departments plus the people directly in it', () => {
        // Ops rolls up 9 people on Lightdash: Stores' 4, Depots' 3 and 2 of its own
        const people = new Map([
            ['ops', 9],
            ['stores', 4],
            ['north', 0],
            ['depots', 3],
        ]);
        const entered = computeEffectiveHeadcounts(
            withHeadcount({ ops: 30, stores: 20, depots: 10 }),
            people,
        );
        // Its 30 is all taken by Stores and Depots, so its own 2 people add to it, and it says so
        expect(entered.get('ops')).toEqual({
            effectiveHeadcount: 32,
            hasHeadcount: true,
            headcountBelowChildren: true,
        });
        const summed = computeEffectiveHeadcounts(
            withHeadcount({ stores: 20, depots: 10 }),
            people,
        );
        // Nothing was entered on Ops, so nothing is below anything
        expect(summed.get('ops')).toEqual({
            effectiveHeadcount: 32,
            hasHeadcount: true,
            headcountBelowChildren: false,
        });
    });
    it('flags a headcount equal to its sub-departments when people sit directly in the department', () => {
        // 440 entered, 440 in its sub-departments and 12 people directly in it, as Engineering in the 6,000 shape
        const result = computeEffectiveHeadcounts(
            [
                {
                    departmentUuid: 'eng',
                    parentDepartmentUuid: null,
                    headcount: 440,
                },
                {
                    departmentUuid: 'apps',
                    parentDepartmentUuid: 'eng',
                    headcount: 300,
                },
                {
                    departmentUuid: 'platform',
                    parentDepartmentUuid: 'eng',
                    headcount: 140,
                },
            ],
            new Map([
                ['eng', 313],
                ['apps', 201],
                ['platform', 100],
            ]),
        );
        expect(result.get('eng')).toEqual({
            effectiveHeadcount: 452,
            hasHeadcount: true,
            headcountBelowChildren: true,
        });
    });
    it('never goes below the people on Lightdash, so a headcount only adds people without an account', () => {
        // Stores has 9 people on Lightdash for a headcount of 8; Ops rolls up 12 for a headcount of 10
        const result = computeEffectiveHeadcounts(
            withHeadcount({ ops: 10, stores: 8, depots: 2 }),
            new Map([
                ['ops', 12],
                ['stores', 9],
                ['north', 0],
                ['depots', 2],
            ]),
        );
        expect(result.get('stores')?.effectiveHeadcount).toBe(9);
        expect(result.get('depots')?.effectiveHeadcount).toBe(2);
        // Below its sub-departments' 11, and floored at the 12 people on Lightdash it rolls up
        expect(result.get('ops')).toEqual({
            effectiveHeadcount: 12,
            hasHeadcount: true,
            headcountBelowChildren: true,
        });
    });
    it('counts the people on Lightdash when neither the department nor anything below it has a headcount', () => {
        const result = computeEffectiveHeadcounts(
            withHeadcount({}),
            new Map([
                ['ops', 5],
                ['stores', 3],
                ['north', 1],
                ['depots', 2],
                ['finance', 0],
            ]),
        );
        expect(result.get('ops')).toEqual({
            effectiveHeadcount: 5,
            hasHeadcount: false,
            headcountBelowChildren: false,
        });
        expect(result.get('north')).toEqual({
            effectiveHeadcount: 1,
            hasHeadcount: false,
            headcountBelowChildren: false,
        });
        expect(result.get('finance')?.effectiveHeadcount).toBe(0);
    });
    it('keeps an explicit zero distinct from missing', () => {
        const result = computeEffectiveHeadcounts(
            withHeadcount({ finance: 0 }),
            NOBODY,
        );
        expect(result.get('finance')).toEqual({
            effectiveHeadcount: 0,
            hasHeadcount: true,
            headcountBelowChildren: false,
        });
    });

    // A parent with sub-departments A and B, people counted from a roll-up that lists each person once
    const parentOfTwo = (
        headcounts: Record<string, number | null>,
    ): DepartmentHeadcountNode[] =>
        [
            { departmentUuid: 'parent', parentDepartmentUuid: null },
            { departmentUuid: 'a', parentDepartmentUuid: 'parent' },
            { departmentUuid: 'b', parentDepartmentUuid: 'parent' },
        ].map((n) => ({
            ...n,
            headcount: headcounts[n.departmentUuid] ?? null,
        }));
    const countPeople = (
        tree: DepartmentHeadcountNode[],
        people: Record<string, string[]>,
    ): Map<string, number> =>
        new Map(
            [
                ...rollUpByDepartment(
                    tree,
                    new Map(
                        Object.entries(people).map(([uuid, userUuids]) => [
                            uuid,
                            userUuids.map((userUuid) => ({ userUuid })),
                        ]),
                    ),
                ),
            ].map(([uuid, rolled]) => [uuid, rolled.length]),
        );

    it('counts a person in two sub-departments once when no headcount is entered anywhere', () => {
        const tree = parentOfTwo({});
        const people = countPeople(tree, { a: ['shared'], b: ['shared'] });
        const result = computeEffectiveHeadcounts(tree, people);
        // One person for a headcount of one, so coverage reads 100 %
        expect(people.get('parent')).toBe(1);
        expect(result.get('parent')).toEqual({
            effectiveHeadcount: 1,
            hasHeadcount: false,
            headcountBelowChildren: false,
        });
    });
    it('does not flag a parent headcount that matches its people when its sub-departments share one', () => {
        const tree = parentOfTwo({ parent: 5 });
        // Five people, three in each sub-department and one of them in both, so the sub-departments add up to 6
        const people = countPeople(tree, {
            a: ['a1', 'a2', 'shared'],
            b: ['shared', 'b1', 'b2'],
        });
        const result = computeEffectiveHeadcounts(tree, people);
        expect(
            (result.get('a')?.effectiveHeadcount ?? 0) +
                (result.get('b')?.effectiveHeadcount ?? 0),
        ).toBe(6);
        expect(result.get('parent')).toEqual({
            effectiveHeadcount: 5,
            hasHeadcount: true,
            headcountBelowChildren: false,
        });
    });
    it('adds up the sub-departments as before when nobody is shared', () => {
        const tree = parentOfTwo({ parent: 5 });
        const people = countPeople(tree, {
            a: ['a1', 'a2', 'a3'],
            b: ['b1', 'b2', 'b3'],
        });
        // Six different people, above the 5 entered
        expect(computeEffectiveHeadcounts(tree, people).get('parent')).toEqual({
            effectiveHeadcount: 6,
            hasHeadcount: true,
            headcountBelowChildren: true,
        });
    });
    it("counts a sub-department's people without an account once beside a person it shares", () => {
        // A's headcount of 4 has 2 people on Lightdash; B's one person is also in A
        const tree = parentOfTwo({ a: 4 });
        const people = countPeople(tree, {
            a: ['a1', 'shared'],
            b: ['shared'],
        });
        // The 2 people on Lightdash and A's 2 without an account
        expect(
            computeEffectiveHeadcounts(tree, people).get('parent')
                ?.effectiveHeadcount,
        ).toBe(4);
    });
});

describe('getChildrenHeadcount', () => {
    it("counts a person in two sub-departments once, and each one's people without an account", () => {
        // 4 people rolled up, 1 directly in the department; A has 2 for a headcount of 5, B 2, and 1 is in both
        expect(
            getChildrenHeadcount({ memberCount: 4, directMemberCount: 1 }, [
                { effectiveHeadcount: 5, memberCount: 2 },
                { effectiveHeadcount: 2, memberCount: 2 },
            ]),
        ).toBe(6);
    });
    it("adds up the sub-departments' effective headcounts when nobody is shared", () => {
        expect(
            getChildrenHeadcount({ memberCount: 6, directMemberCount: 1 }, [
                { effectiveHeadcount: 10, memberCount: 3 },
                { effectiveHeadcount: 4, memberCount: 2 },
            ]),
        ).toBe(14);
    });
    it('is 0 without sub-departments', () => {
        expect(
            getChildrenHeadcount({ memberCount: 3, directMemberCount: 3 }, []),
        ).toBe(0);
    });
});

describe('getResidualHeadcount', () => {
    it('keeps what a department leaves over its sub-departments for the people directly in it', () => {
        expect(getResidualHeadcount(40, 30, 4)).toBe(10);
    });
    it('never keeps fewer than the people directly in it', () => {
        expect(getResidualHeadcount(30, 30, 2)).toBe(2);
        expect(getResidualHeadcount(30, 35, 0)).toBe(0);
    });
    it('is the effective headcount for a department without sub-departments', () => {
        expect(getResidualHeadcount(8, 0, 3)).toBe(8);
    });
    it('keeps what the headcount leaves over its sub-departments with a person they share counted once', () => {
        // 10 entered; A and B have 2 people each, 1 of them in both, and 1 person is directly in the department
        const childrenHeadcount = getChildrenHeadcount(
            { memberCount: 4, directMemberCount: 1 },
            [
                { effectiveHeadcount: 2, memberCount: 2 },
                { effectiveHeadcount: 2, memberCount: 2 },
            ],
        );
        expect(childrenHeadcount).toBe(3);
        expect(getResidualHeadcount(10, childrenHeadcount, 1)).toBe(7);
    });
});

describe('rollUpByDepartment', () => {
    const person = (userUuid: string, countedIn = '') => ({
        userUuid,
        countedIn,
    });
    const userUuids = (people: { userUuid: string }[] | undefined) =>
        people?.map((p) => p.userUuid);

    it('gives a parent its own people plus all descendants', () => {
        const direct = new Map([
            ['ops', [person('a')]],
            ['north', [person('b')]],
            ['depots', [person('c')]],
        ]);
        const rolled = rollUpByDepartment(nodes, direct);
        expect(userUuids(rolled.get('ops'))?.sort()).toEqual(['a', 'b', 'c']);
        expect(userUuids(rolled.get('stores'))).toEqual(['b']);
        expect(rolled.get('finance')).toEqual([]);
    });
    it('lists a person once per department, keeping the first occurrence in order', () => {
        const direct = new Map([
            ['ops', [person('a', 'ops')]],
            ['stores', [person('b', 'stores')]],
            ['depots', [person('b', 'depots'), person('d', 'depots')]],
            ['north', [person('a', 'north'), person('c', 'north')]],
        ]);
        const rolled = rollUpByDepartment(nodes, direct);
        // Own people first, then descendants breadth first: stores, depots, north
        expect(rolled.get('ops')).toEqual([
            person('a', 'ops'),
            person('b', 'stores'),
            person('d', 'depots'),
            person('c', 'north'),
        ]);
        expect(rolled.get('stores')).toEqual([
            person('b', 'stores'),
            person('a', 'north'),
            person('c', 'north'),
        ]);
    });
});

describe('very deep and very wide trees', () => {
    const SIZE = 5000;
    // d0 is the top, each next one sits under the previous; the top sorts first, as a name order can make it
    const chain = Array.from({ length: SIZE }, (_, i) => ({
        departmentUuid: `d${i}`,
        parentDepartmentUuid: i === 0 ? null : `d${i - 1}`,
    }));
    const wide = [
        { departmentUuid: 'root', parentDepartmentUuid: null },
        ...Array.from({ length: SIZE }, (_, i) => ({
            departmentUuid: `c${i}`,
            parentDepartmentUuid: 'root',
        })),
    ];
    const leaf = `d${SIZE - 1}`;

    it('walks ancestors and descendants of a 5,000-deep chain and a 5,000-wide level', () => {
        expect(getAncestorUuids(leaf, getParentMap(chain))).toHaveLength(
            SIZE - 1,
        );
        expect(getDescendantUuids('d0', chain)).toHaveLength(SIZE - 1);
        expect(getDescendantUuids('root', wide)).toHaveLength(SIZE);
    });

    it('computes effective headcounts without overflowing the stack', () => {
        const deep = computeEffectiveHeadcounts(
            chain.map((n) => ({
                ...n,
                headcount: n.departmentUuid === leaf ? 7 : null,
            })),
            new Map(),
        );
        expect(deep.size).toBe(SIZE);
        expect(deep.get('d0')?.effectiveHeadcount).toBe(7);
        const broad = computeEffectiveHeadcounts(
            wide.map((n) => ({
                ...n,
                headcount: n.departmentUuid === 'root' ? null : 1,
            })),
            new Map(),
        );
        expect(broad.get('root')?.effectiveHeadcount).toBe(SIZE);
    });

    it('rolls up people without overflowing the stack', () => {
        const p = { userUuid: 'p' };
        const deep = rollUpByDepartment(chain, new Map([[leaf, [p]]]));
        expect(deep.get('d0')).toEqual([p]);
        expect(deep.get(`d${SIZE - 2}`)).toEqual([p]);
        const broad = rollUpByDepartment(
            wide,
            new Map(
                wide
                    .slice(1)
                    .map((n) => [
                        n.departmentUuid,
                        [{ userUuid: n.departmentUuid }],
                    ]),
            ),
        );
        expect(broad.get('root')).toEqual(
            wide.slice(1).map((n) => ({ userUuid: n.departmentUuid })),
        );
    });

    it('measures depth and branch height without overflowing the stack', () => {
        expect(getDepthMap(chain).get(leaf)).toBe(SIZE - 1);
        expect(getDepthMap([...chain].reverse()).get(leaf)).toBe(SIZE - 1);
        expect(getBranchHeight('d0', chain)).toBe(SIZE);
        expect(getDepthMap(wide).get('c42')).toBe(1);
        expect(getBranchHeight('root', wide)).toBe(2);
    });
});

describe('getDepthMap', () => {
    it('counts ancestors, nearest parent outside the set included', () => {
        const depths = getDepthMap([
            ...nodes,
            { departmentUuid: 'orphan', parentDepartmentUuid: 'gone' },
        ]);
        expect(Object.fromEntries(depths)).toEqual({
            ops: 0,
            stores: 1,
            north: 2,
            depots: 1,
            finance: 0,
            orphan: 1,
        });
    });
});

describe('getBranchHeight', () => {
    it('counts the levels in a branch, the department itself included', () => {
        expect(getBranchHeight('ops', nodes)).toBe(3);
        expect(getBranchHeight('north', nodes)).toBe(1);
    });
    it('terminates on corrupt cyclic data', () => {
        expect(
            getBranchHeight('a', [
                { departmentUuid: 'a', parentDepartmentUuid: 'b' },
                { departmentUuid: 'b', parentDepartmentUuid: 'a' },
            ]),
        ).toBe(2);
    });
});

// The recursive versions these replaced, kept to prove the walks give the same answers. 'summed' is the rule
// before people could be shared: the sub-departments' effective headcounts added up
const recursiveEffectiveHeadcounts = (
    input: {
        departmentUuid: string;
        parentDepartmentUuid: string | null;
        headcount: number | null;
    }[],
    memberCounts: Map<string, number>,
    rule: 'deduped' | 'summed' = 'deduped',
) => {
    const children = getChildrenMap(input);
    const byUuid = new Map(input.map((n) => [n.departmentUuid, n]));
    type Value = {
        effectiveHeadcount: number;
        hasHeadcount: boolean;
        headcountBelowChildren: boolean;
    };
    const result = new Map<string, Value>();
    const visit = (uuid: string, path: Set<string>): Value => {
        const cached = result.get(uuid);
        if (cached) return cached;
        const visitedUuids = (children.get(uuid) ?? []).filter(
            (child) => !path.has(child),
        );
        const visited = visitedUuids.map((child) =>
            visit(child, new Set([...path, child])),
        );
        const sum =
            visited.length > 0
                ? visited.reduce((a, b) => a + b.effectiveHeadcount, 0)
                : null;
        const gaps = visited.reduce(
            (total, child, index) =>
                total +
                child.effectiveHeadcount -
                (memberCounts.get(visitedUuids[index]) ?? 0),
            0,
        );
        const own = byUuid.get(uuid)?.headcount ?? null;
        const floor = (memberCounts.get(uuid) ?? 0) + gaps;
        const hasHeadcount =
            own !== null || visited.some((child) => child.hasHeadcount);
        const value =
            rule === 'deduped'
                ? {
                      effectiveHeadcount: Math.max(own ?? 0, floor),
                      hasHeadcount,
                      headcountBelowChildren:
                          own !== null && visited.length > 0 && own < floor,
                  }
                : {
                      effectiveHeadcount: Math.max(own ?? sum ?? 0, floor),
                      hasHeadcount,
                      headcountBelowChildren:
                          own !== null &&
                          sum !== null &&
                          own < Math.max(sum, floor),
                  };
        result.set(uuid, value);
        return value;
    };
    input.forEach((n) => visit(n.departmentUuid, new Set([n.departmentUuid])));
    return result;
};

const perDepartmentRollUp = <T extends { userUuid: string }>(
    input: { departmentUuid: string; parentDepartmentUuid: string | null }[],
    direct: Map<string, T[]>,
) =>
    new Map(
        input.map((n) => {
            // Same rule as the walk under test: each person once, first occurrence kept
            const seen = new Set<string>();
            return [
                n.departmentUuid,
                [
                    n.departmentUuid,
                    ...getDescendantUuids(n.departmentUuid, input),
                ]
                    .flatMap((uuid) => direct.get(uuid) ?? [])
                    .filter((person) => {
                        if (seen.has(person.userUuid)) return false;
                        seen.add(person.userUuid);
                        return true;
                    }),
            ];
        }),
    );

describe('iterative walks match the recursive ones', () => {
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
    const randomTree = (seed: number) => {
        const next = random(seed);
        const size = 1 + Math.floor(next() * 25);
        const uuids = Array.from({ length: size }, (_, i) => `n${i}`);
        // Parents at random: top level, missing, or any department, which makes cycles and self-parents
        const pickParent = (): string | null => {
            const roll = next();
            if (roll < 0.25) return null;
            if (roll < 0.3) return 'gone';
            return uuids[Math.floor(next() * size)];
        };
        return uuids.map((departmentUuid) => {
            const parentDepartmentUuid = pickParent();
            return {
                departmentUuid,
                parentDepartmentUuid,
                headcount: next() < 0.5 ? null : Math.floor(next() * 50),
            };
        });
    };

    it.each(Array.from({ length: 400 }, (_, seed) => seed + 1))(
        'gives the same headcounts, roll-ups and depths for random tree %i',
        (seed) => {
            const tree = randomTree(seed);
            // People on Lightdash for some departments, at times above their headcount
            const memberCounts = new Map(
                tree
                    .filter((_, i) => i % 2 === 0)
                    .map((n, i) => [n.departmentUuid, (i * 7) % 40]),
            );
            expect([...computeEffectiveHeadcounts(tree, memberCounts)]).toEqual(
                [...recursiveEffectiveHeadcounts(tree, memberCounts)],
            );
            // The second person comes from a small shared pool, so some count in several departments
            const direct = new Map(
                tree
                    .filter((_, i) => i % 3 !== 0)
                    .map((n, i) => [
                        n.departmentUuid,
                        [
                            { userUuid: `${n.departmentUuid}-a` },
                            { userUuid: `p${i % 7}` },
                        ],
                    ]),
            );
            expect([...rollUpByDepartment(tree, direct)]).toEqual([
                ...perDepartmentRollUp(tree, direct),
            ]);
            const depths = getDepthMap(tree);
            const parentMap = getParentMap(tree);
            tree.forEach((n) =>
                expect(depths.get(n.departmentUuid)).toBe(
                    getAncestorUuids(n.departmentUuid, parentMap).length,
                ),
            );
        },
    );

    it.each(Array.from({ length: 200 }, (_, seed) => seed + 1))(
        'gives what adding up the sub-departments gives when nobody is shared, for random tree %i',
        (seed) => {
            const next = random(seed);
            const size = 1 + Math.floor(next() * 25);
            // Each parent comes before its children, so there is no cycle, and everyone is in one department
            const tree = Array.from({ length: size }, (_, i) => ({
                departmentUuid: `n${i}`,
                parentDepartmentUuid:
                    i === 0 || next() < 0.25
                        ? null
                        : `n${Math.floor(next() * i)}`,
                headcount: next() < 0.5 ? null : Math.floor(next() * 50),
            }));
            const direct = new Map(
                tree.map((n) => [
                    n.departmentUuid,
                    Array.from({ length: Math.floor(next() * 6) }, (_, k) => ({
                        userUuid: `${n.departmentUuid}-${k}`,
                    })),
                ]),
            );
            const memberCounts = new Map(
                [...rollUpByDepartment(tree, direct)].map(([uuid, people]) => [
                    uuid,
                    people.length,
                ]),
            );
            const result = computeEffectiveHeadcounts(tree, memberCounts);
            expect(Object.fromEntries(result)).toEqual(
                Object.fromEntries(
                    recursiveEffectiveHeadcounts(tree, memberCounts, 'summed'),
                ),
            );
            const children = getChildrenMap(tree);
            tree.forEach((n) => {
                const childUuids = children.get(n.departmentUuid) ?? [];
                const effectiveOf = (uuid: string) =>
                    result.get(uuid)?.effectiveHeadcount ?? 0;
                expect(
                    getChildrenHeadcount(
                        {
                            memberCount:
                                memberCounts.get(n.departmentUuid) ?? 0,
                            directMemberCount:
                                direct.get(n.departmentUuid)?.length ?? 0,
                        },
                        childUuids.map((uuid) => ({
                            effectiveHeadcount: effectiveOf(uuid),
                            memberCount: memberCounts.get(uuid) ?? 0,
                        })),
                    ),
                ).toBe(
                    childUuids.reduce(
                        (sum, uuid) => sum + effectiveOf(uuid),
                        0,
                    ),
                );
            });
        },
    );
});
