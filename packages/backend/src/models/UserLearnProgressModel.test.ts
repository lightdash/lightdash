import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    toLearnProgress,
    UserLearnProgressModel,
} from './UserLearnProgressModel';

describe('toLearnProgress', () => {
    it('reads completed, started and the most recent start from rows', () => {
        expect(
            toLearnProgress([
                {
                    scope: 'view:Dashboard',
                    last_started_at: new Date('2026-09-01T10:00:00Z'),
                    completed_at: new Date('2026-09-01T10:10:00Z'),
                },
                {
                    scope: 'manage:Space',
                    last_started_at: new Date('2026-09-02T10:00:00Z'),
                    completed_at: null,
                },
                {
                    scope: 'view:SavedChart',
                    last_started_at: new Date('2026-08-30T10:00:00Z'),
                    completed_at: new Date('2026-08-30T10:05:00Z'),
                },
            ]),
        ).toEqual({
            completed: ['view:Dashboard', 'view:SavedChart'],
            started: ['view:Dashboard', 'manage:Space', 'view:SavedChart'],
            lastStarted: 'manage:Space',
        });
    });

    it('has nothing to resume when there are no rows', () => {
        expect(toLearnProgress([])).toEqual({
            completed: [],
            started: [],
            lastStarted: null,
        });
    });
});

describe('UserLearnProgressModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new UserLearnProgressModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('upserts a start and moves last_started_at forward', async () => {
        tracker.on.insert('user_learn_progress').responseOnce([]);
        await model.markStarted('user-1', 'view:Dashboard');
        const [query] = tracker.history.insert;
        expect(query.sql).toContain('on conflict ("user_uuid", "scope")');
        expect(query.sql).toContain('"last_started_at" = CURRENT_TIMESTAMP');
        expect(query.sql).not.toContain('completed_at');
        expect(query.bindings).toEqual(['view:Dashboard', 'user-1']);
    });

    it('keeps the first completion time on a repeat completion', async () => {
        tracker.on.insert('user_learn_progress').responseOnce([]);
        await model.markCompleted('user-1', 'view:Dashboard');
        const [query] = tracker.history.insert;
        expect(query.sql).toContain(
            'COALESCE(user_learn_progress.completed_at, excluded.completed_at)',
        );
    });

    it('imports browser rows dated before any real start, Resume scope last', async () => {
        tracker.on.insert('user_learn_progress').responseOnce([]);
        await model.merge('user-1', {
            completed: ['view:Dashboard'],
            started: ['manage:Space', 'view:Dashboard'],
            lastStarted: 'manage:Space',
        });
        const [query] = tracker.history.insert;
        expect(query.sql).toContain('on conflict ("user_uuid", "scope")');
        // Two rows: view:Dashboard (completed) first, manage:Space last.
        const bindings = query.bindings as unknown[];
        expect(bindings.filter((b) => typeof b === 'string')).toEqual([
            'view:Dashboard',
            'user-1',
            'manage:Space',
            'user-1',
        ]);
        const dates = bindings.filter((b) => b instanceof Date) as Date[];
        expect(dates.every((d) => d.getTime() < 10)).toBe(true);
    });

    it('imports nothing from an empty browser store', async () => {
        await model.merge('user-1', {
            completed: [],
            started: [],
            lastStarted: null,
        });
        expect(tracker.history.insert).toHaveLength(0);
    });
});
