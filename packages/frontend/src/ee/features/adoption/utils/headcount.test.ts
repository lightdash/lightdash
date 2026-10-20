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

// The same, with one person in both Stores and Depots, so Ops rolls up 10 people rather than 11
const sharedTree = (headcount: number | null) =>
    withServerHeadcounts([
        dept('Ops', null, null, {
            headcount,
            metrics: metricsFixture(10, null),
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

describe('withServerHeadcounts', () => {
    it('counts a person in two sub-departments once in their parent, as the server does', () => {
        const [parent] = withServerHeadcounts([
            dept('Ops', null, null, {
                headcount: null,
                metrics: metricsFixture(1, null),
                directMetrics: metricsFixture(0, null),
            }),
            dept('Stores', 'Ops', null, { headcount: null }),
            dept('Depots', 'Ops', null, { headcount: null }),
        ]);
        expect(parent).toMatchObject({
            effectiveHeadcount: 1,
            hasHeadcount: false,
            headcountBelowChildren: false,
        });
    });
});

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
    it('keeps what is left over its sub-departments with a person they share counted once', () => {
        // Stores and Depots count 29 together: their 8 people and 21 without an account
        const [ops, ...children] = sharedTree(40);
        expect(getDirectHeadcount(ops, children)).toBe(11);
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
    it('counts a person in two sub-departments once', () => {
        const [ops, ...children] = sharedTree(40);
        expect(getHeadcountFloor(ops, children)).toBe(31);
    });
});
