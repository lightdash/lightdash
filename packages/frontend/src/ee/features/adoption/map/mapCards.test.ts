import { describe, expect, it } from 'vitest';
import { dept, metricsFixture } from '../utils/adoptionFixtures';
import { computeMapCards } from './mapCards';

const d = (
    name: string,
    headcount: number | null,
    members: number,
    active: number,
    target: number | null = null,
) =>
    dept(name, null, null, {
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
        const empty = computeMapCards([d('Finance', null, 3, 3)], {
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
        const met = computeMapCards([d('Sales', 50, 40, 45, 45)], attention);
        expect(met[1]).toMatchObject({
            value: '–',
            detail: 'Every target is met',
        });
    });
    it('lets the first department in input order win a tie', () => {
        const tied = computeMapCards(
            [d('First', 10, 8, 2), d('Second', 10, 8, 2)],
            attention,
        );
        expect(tied[0].departmentUuid).toBe('First');
        expect(tied[2].departmentUuid).toBe('First');
    });
    it('returns four explanatory cards for an empty department list', () => {
        const none = computeMapCards([], {
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
