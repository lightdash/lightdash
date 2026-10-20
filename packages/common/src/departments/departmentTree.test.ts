import { describe, expect, it } from 'vitest';
import {
    computeEffectiveHeadcounts,
    getAncestorUuids,
    getChildrenMap,
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

    it('uses the own value when set', () => {
        const result = computeEffectiveHeadcounts(
            withHeadcount({ ops: 100, stores: 40, depots: 20 }),
        );
        expect(result.get('ops')).toEqual({
            effectiveHeadcount: 100,
            headcountBelowChildren: false,
        });
    });
    it('sums children when the own value is missing, through several levels', () => {
        const result = computeEffectiveHeadcounts(
            withHeadcount({ north: 15, depots: 20 }),
        );
        expect(result.get('stores')?.effectiveHeadcount).toBe(15);
        expect(result.get('ops')?.effectiveHeadcount).toBe(35);
    });
    it('flags an own value smaller than the children sum and still uses it', () => {
        const result = computeEffectiveHeadcounts(
            withHeadcount({ ops: 30, stores: 40, depots: 20 }),
        );
        expect(result.get('ops')).toEqual({
            effectiveHeadcount: 30,
            headcountBelowChildren: true,
        });
    });
    it('is null, not zero, when neither the department nor its children have a headcount', () => {
        const result = computeEffectiveHeadcounts(withHeadcount({}));
        expect(result.get('ops')).toEqual({
            effectiveHeadcount: null,
            headcountBelowChildren: false,
        });
    });
    it('keeps an explicit zero distinct from missing', () => {
        const result = computeEffectiveHeadcounts(
            withHeadcount({ finance: 0 }),
        );
        expect(result.get('finance')?.effectiveHeadcount).toBe(0);
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
