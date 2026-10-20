import { describe, expect, it } from 'vitest';
import { dept, metricsFixture, withServerHeadcounts } from './adoptionFixtures';
import { getDirectHeadcount, getHeadcountFloor } from './headcount';

// Ops has Stores (20, 6 on Lightdash) and Depots (10, 3 on Lightdash) and 2 people of its own
const tree = (headcount: number | null) =>
    withServerHeadcounts([
        dept('Ops', null, null, {
            headcount,
            metrics: metricsFixture(11, null),
            directMetrics: metricsFixture(2, null),
        }),
        dept('Stores', 'Ops', null, {
            headcount: 20,
            metrics: metricsFixture(6, null),
            directMetrics: metricsFixture(6, null),
        }),
        dept('Depots', 'Ops', null, {
            headcount: 10,
            metrics: metricsFixture(3, null),
            directMetrics: metricsFixture(3, null),
        }),
    ]);

describe('getDirectHeadcount', () => {
    it('keeps what a department leaves over its sub-departments for the people directly in it', () => {
        const [ops, ...children] = tree(40);
        expect(getDirectHeadcount(ops, children)).toBe(10);
    });
    it('keeps the people directly in it when its sub-departments take up its headcount', () => {
        const [ops, ...children] = tree(30);
        expect(ops.effectiveHeadcount).toBe(32);
        expect(getDirectHeadcount(ops, children)).toBe(2);
    });
    it('is the effective headcount of a department without sub-departments', () => {
        const [, stores] = tree(40);
        expect(getDirectHeadcount(stores, [])).toBe(20);
    });
});

describe('getHeadcountFloor', () => {
    it("adds the people directly in a department to its sub-departments' headcounts", () => {
        const [ops, ...children] = tree(40);
        expect(getHeadcountFloor(ops, children)).toBe(32);
    });
    it('is the people on Lightdash in a department without sub-departments', () => {
        const [, stores] = tree(40);
        expect(getHeadcountFloor(stores, [])).toBe(6);
    });
});
