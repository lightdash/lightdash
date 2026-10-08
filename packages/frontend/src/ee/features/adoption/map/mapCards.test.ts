import { describe, expect, it } from 'vitest';
import { dept, metricsFixture } from '../utils/adoptionFixtures';
import { computeMapCards } from './mapCards';

const d = (
    name: string,
    headcount: number | null,
    members: number,
    active: number,
    target: number | null = null,
    parent: string | null = null,
) =>
    dept(name, parent, null, {
        headcount,
        effectiveHeadcount: headcount,
        targetActiveUsers: target,
        metrics: metricsFixture(members, null, { activeCount30d: active }),
    });

const attention = { conflictCount: 2, unassignedCount: 3 };

describe('computeMapCards', () => {
    const cards = computeMapCards(
        [
            d('Sales', 50, 40, 35, 45),
            d('Ops', 200, 30, 10, 60),
            d('Finance', null, 12, 2),
        ],
        null,
        attention,
    );
    const byKey = new Map(cards.map((c) => [c.key, c]));

    it('always returns the four cards in a fixed order', () => {
        expect(cards.map((c) => c.key)).toEqual([
            'biggestGap',
            'furthestBehind',
            'seatsUnused',
            'unplaced',
        ]);
    });
    it('biggest gap is the most people in headcount who are not active', () => {
        expect(byKey.get('biggestGap')).toMatchObject({
            value: '190 people',
            detail: 'Ops: 10 of 200 active',
            departmentUuid: 'Ops',
        });
    });
    it('furthest behind is the largest shortfall against a target', () => {
        expect(byKey.get('furthestBehind')).toMatchObject({
            value: '50 short',
            detail: 'Ops: 10 of 60 target',
            departmentUuid: 'Ops',
        });
    });
    it('most seats unused is the most accounts that are not active', () => {
        expect(byKey.get('seatsUnused')).toMatchObject({
            value: '20 idle',
            detail: 'Ops: on Lightdash but not active in 30 days',
            departmentUuid: 'Ops',
        });
    });
    it('unplaced people adds conflicts and unassigned', () => {
        expect(byKey.get('unplaced')).toMatchObject({
            value: '5 people',
            detail: 'In no department or in more than one',
            departmentUuid: null,
        });
    });
    it('explains itself when there is nothing to rank', () => {
        const empty = computeMapCards([d('Finance', null, 3, 3)], null, {
            conflictCount: 0,
            unassignedCount: 0,
        });
        expect(empty.map((c) => [c.value, c.detail])).toEqual([
            ['–', 'Add headcount to see gaps'],
            ['–', 'No targets set'],
            ['–', 'Everyone with an account is active'],
            ['0 people', 'Everyone is placed'],
        ]);
    });
    it('says when every target is met', () => {
        const met = computeMapCards(
            [d('Sales', 50, 40, 45, 45)],
            null,
            attention,
        );
        expect(met[1]).toMatchObject({
            value: '–',
            detail: 'Every target is met',
        });
    });
    it('breaks a tie by name, whatever the input order', () => {
        const tied = computeMapCards(
            [d('Second', 10, 8, 2, 6), d('First', 10, 8, 2, 6)],
            null,
            attention,
        );
        expect(tied.map((card) => card.departmentUuid)).toEqual([
            'First',
            'First',
            'First',
            null,
        ]);
    });
    it('returns four explanatory cards for an empty department list', () => {
        const none = computeMapCards([], null, {
            conflictCount: 0,
            unassignedCount: 0,
        });
        expect(none.map((c) => c.key)).toEqual([
            'biggestGap',
            'furthestBehind',
            'seatsUnused',
            'unplaced',
        ]);
        expect(none.map((c) => [c.value, c.detail])).toEqual([
            ['–', 'Add headcount to see gaps'],
            ['–', 'No targets set'],
            ['–', 'Everyone with an account is active'],
            ['0 people', 'Everyone is placed'],
        ]);
    });
});

describe('computeMapCards below the current level', () => {
    // Targets sit at every depth: a sub-department can be further behind than any top-level one
    const organization = [
        d('Operations', 2350, 221, 126),
        d('Supply chain', 1750, 170, 96, null, 'Operations'),
        d('Warehousing', 900, 12, 3, 60, 'Supply chain'),
        d('Logistics', 600, 48, 27, null, 'Supply chain'),
        d('Commercial', 1900, 834, 495),
        d('Customer success', 700, 312, 179, null, 'Commercial'),
        d('Support', 400, 141, 76, 150, 'Customer success'),
        d('Legal', 60, 0, 0, 10),
    ];
    const byKey = (focus: string | null) =>
        new Map(
            computeMapCards(organization, focus, attention).map((card) => [
                card.key,
                card,
            ]),
        );

    it('finds the department furthest behind its target at any depth and names its path', () => {
        expect(byKey(null).get('furthestBehind')).toMatchObject({
            value: '74 short',
            detail: 'Commercial / Customer success / Support: 76 of 150 target',
            departmentUuid: 'Support',
        });
    });
    it('looks below the focused department, with the path from the level shown', () => {
        expect(byKey('Operations').get('furthestBehind')).toMatchObject({
            value: '57 short',
            detail: 'Supply chain / Warehousing: 3 of 60 target',
            departmentUuid: 'Warehousing',
        });
    });
    it('ranks seats unused across every department below the level too', () => {
        expect(byKey(null).get('seatsUnused')).toMatchObject({
            value: '339 idle',
            detail: 'Commercial: on Lightdash but not active in 30 days',
            departmentUuid: 'Commercial',
        });
        // All of Supply chain's idle seats are in Logistics and Warehousing; Logistics has the most
        expect(byKey('Supply chain').get('seatsUnused')).toMatchObject({
            value: '21 idle',
            detail: 'Logistics: on Lightdash but not active in 30 days',
            departmentUuid: 'Logistics',
        });
    });
    it('names the path when a sub-department ties its parent and wins on name', () => {
        // Every idle seat in Operations is in Analytics, so the two tie and the name decides
        const tied = computeMapCards(
            [
                d('Operations', 100, 10, 5),
                d('Analytics', 50, 10, 5, null, 'Operations'),
            ],
            null,
            attention,
        );
        expect(tied[2]).toMatchObject({
            detail: 'Operations / Analytics: on Lightdash but not active in 30 days',
            departmentUuid: 'Analytics',
        });
    });
    it('keeps the biggest gap to the departments at the current level', () => {
        expect(byKey(null).get('biggestGap')).toMatchObject({
            value: '2,224 people',
            detail: 'Operations: 126 of 2,350 active',
            departmentUuid: 'Operations',
        });
        expect(byKey('Operations').get('biggestGap')).toMatchObject({
            detail: 'Supply chain: 96 of 1,750 active',
        });
    });
    it('compares a department without sub-departments with itself', () => {
        expect(byKey('Warehousing').get('furthestBehind')).toMatchObject({
            detail: 'Warehousing: 3 of 60 target',
        });
    });
    it('groups thousands in every number', () => {
        const big = computeMapCards(
            [d('Everyone', 12000, 9000, 1000, 5000)],
            null,
            { conflictCount: 1000, unassignedCount: 234 },
        );
        expect(big.map((card) => card.value)).toEqual([
            '11,000 people',
            '4,000 short',
            '8,000 idle',
            '1,234 people',
        ]);
        expect(big[0].detail).toBe('Everyone: 1,000 of 12,000 active');
        expect(big[1].detail).toBe('Everyone: 1,000 of 5,000 target');
    });
});
