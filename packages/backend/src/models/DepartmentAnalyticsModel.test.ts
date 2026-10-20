import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DepartmentAnalyticsModel } from './DepartmentAnalyticsModel';

describe('DepartmentAnalyticsModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new DepartmentAnalyticsModel({ database });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    it('returns no activity for an empty user set without querying', async () => {
        expect(await model.getWeeklyActivity('org', [], 12)).toEqual([]);
        expect(await model.getActiveUserUuids('org', [], 30)).toEqual([]);
        expect(tracker.history.all).toHaveLength(0);
    });

    it('maps weekly rows to camelCase', async () => {
        tracker.on.any(/analytics_chart_views/).responseOnce({
            rows: [{ user_uuid: 'u1', week_start: '2026-09-28' }],
        });
        expect(await model.getWeeklyActivity('org', ['u1'], 12)).toEqual([
            { userUuid: 'u1', weekStart: '2026-09-28' },
        ]);
    });

    it('scopes query history to the organization and passes users as one array binding', async () => {
        tracker.on
            .any(/query_history/)
            .responseOnce({ rows: [{ user_uuid: 'u1' }] });
        expect(await model.getActiveUserUuids('org', ['u1', 'u2'], 30)).toEqual(
            ['u1'],
        );
        const [query] = tracker.history.all;
        expect(query.bindings[0]).toBe('org');
        expect(query.bindings[1]).toEqual(['u1', 'u2']);
    });
});
