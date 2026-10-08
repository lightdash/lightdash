import { describe, expect, it } from 'vitest';
import {
    computeEffectiveHeadcounts,
    getAncestorUuids,
    getBranchHeight,
    getChildrenMap,
    getDepthMap,
    getDescendantUuids,
    getParentMap,
    rollUpByDepartment,
    wouldCreateCycle,
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
    it('flags an own value smaller than the children sum and still uses it', () => {
        const result = computeEffectiveHeadcounts(
            withHeadcount({ ops: 30, stores: 40, depots: 20 }),
            NOBODY,
        );
        expect(result.get('ops')).toEqual({
            effectiveHeadcount: 30,
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
});

describe('rollUpByDepartment', () => {
    it('gives a parent its own items plus all descendants', () => {
        const direct = new Map([
            ['ops', ['a']],
            ['north', ['b']],
            ['depots', ['c']],
        ]);
        const rolled = rollUpByDepartment(nodes, direct);
        expect(rolled.get('ops')?.sort()).toEqual(['a', 'b', 'c']);
        expect(rolled.get('stores')).toEqual(['b']);
        expect(rolled.get('finance')).toEqual([]);
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
        const deep = rollUpByDepartment(chain, new Map([[leaf, ['p']]]));
        expect(deep.get('d0')).toEqual(['p']);
        expect(deep.get(`d${SIZE - 2}`)).toEqual(['p']);
        const broad = rollUpByDepartment(
            wide,
            new Map(
                wide
                    .slice(1)
                    .map((n) => [n.departmentUuid, [n.departmentUuid]]),
            ),
        );
        expect(broad.get('root')).toEqual(
            wide.slice(1).map((n) => n.departmentUuid),
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

// The recursive versions these replaced, kept to prove the walks give the same answers
const recursiveEffectiveHeadcounts = (
    input: {
        departmentUuid: string;
        parentDepartmentUuid: string | null;
        headcount: number | null;
    }[],
    memberCounts: Map<string, number>,
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
        const visited = (children.get(uuid) ?? [])
            .filter((child) => !path.has(child))
            .map((child) => visit(child, new Set([...path, child])));
        const sum =
            visited.length > 0
                ? visited.reduce((a, b) => a + b.effectiveHeadcount, 0)
                : null;
        const own = byUuid.get(uuid)?.headcount ?? null;
        const value = {
            effectiveHeadcount: Math.max(
                own ?? sum ?? 0,
                memberCounts.get(uuid) ?? 0,
            ),
            hasHeadcount:
                own !== null || visited.some((child) => child.hasHeadcount),
            headcountBelowChildren: own !== null && sum !== null && own < sum,
        };
        result.set(uuid, value);
        return value;
    };
    input.forEach((n) => visit(n.departmentUuid, new Set([n.departmentUuid])));
    return result;
};

const perDepartmentRollUp = <T>(
    input: { departmentUuid: string; parentDepartmentUuid: string | null }[],
    direct: Map<string, T[]>,
) =>
    new Map(
        input.map((n) => [
            n.departmentUuid,
            [
                n.departmentUuid,
                ...getDescendantUuids(n.departmentUuid, input),
            ].flatMap((uuid) => direct.get(uuid) ?? []),
        ]),
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
            const direct = new Map(
                tree
                    .filter((_, i) => i % 3 !== 0)
                    .map((n) => [
                        n.departmentUuid,
                        [`${n.departmentUuid}-a`, `${n.departmentUuid}-b`],
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
});
