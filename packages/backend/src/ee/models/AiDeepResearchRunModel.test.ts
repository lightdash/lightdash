import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    AiDeepResearchEventsTableName,
    AiDeepResearchRunsTableName,
} from '../database/entities/aiDeepResearch';
import { AiDeepResearchRunModel } from './AiDeepResearchRunModel';

const RUN_UUID = '00000000-0000-0000-0000-000000000001';
const EVENT_UUID = '00000000-0000-0000-0000-000000000002';

const reportMarkdown =
    'Intro.\n\n## Finding\n\n<confidence level="high">ok</confidence>\n\n## Conclusion\n\n- done';

const runRow = (overrides: Record<string, unknown> = {}) => ({
    ai_deep_research_run_uuid: RUN_UUID,
    status: 'running',
    ...overrides,
});

describe('AiDeepResearchRunModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new AiDeepResearchRunModel({
        database: database as unknown as Knex,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('claims a queued run only when cancellation has not been requested', async () => {
        tracker.on.update(AiDeepResearchRunsTableName).responseOnce([runRow()]);
        tracker.on.insert(AiDeepResearchEventsTableName).responseOnce([]);

        const run = await model.claimQueuedRun(RUN_UUID);

        expect(run).toEqual(runRow());
        const [update] = tracker.history.update;
        expect(update.sql).toContain('set "status" = $1');
        expect(update.sql).toContain('"cancellation_requested_at" is null');
        expect(update.bindings).toEqual(
            expect.arrayContaining(['queued', 'running', RUN_UUID]),
        );
        expect(tracker.history.insert[0].bindings).toEqual(
            expect.arrayContaining([
                RUN_UUID,
                'status_changed',
                JSON.stringify({ status: 'running' }),
            ]),
        );
    });

    it('scopes user-facing lookups by organization and project', async () => {
        tracker.on.select(AiDeepResearchRunsTableName).responseOnce([]);

        await model.findByUuidScoped({
            aiDeepResearchRunUuid: RUN_UUID,
            organizationUuid: 'organization-1',
            projectUuid: 'project-1',
        });

        expect(tracker.history.select[0].bindings).toEqual([
            RUN_UUID,
            'organization-1',
            'project-1',
            1,
        ]);
    });

    it('does not overwrite a cancellation request with completion', async () => {
        tracker.on.update(AiDeepResearchRunsTableName).responseOnce([]);

        const updated = await model.markCompleted(RUN_UUID, reportMarkdown, {});

        expect(updated).toBe(false);
        const [update] = tracker.history.update;
        expect(update.sql).toContain('"cancellation_requested_at" is null');
        expect(update.bindings).toEqual(
            expect.arrayContaining(['running', 'completed', RUN_UUID]),
        );
        expect(tracker.history.insert).toHaveLength(0);
    });

    it('cancels a queued run immediately and records both lifecycle events', async () => {
        tracker.on
            .update(AiDeepResearchRunsTableName)
            .responseOnce([runRow({ status: 'cancelled' })]);
        tracker.on.insert(AiDeepResearchEventsTableName).response([]);

        const run = await model.requestCancellation(RUN_UUID);

        expect(run).toEqual(runRow({ status: 'cancelled' }));
        expect(tracker.history.update).toHaveLength(1);
        expect(tracker.history.update[0].bindings).toEqual(
            expect.arrayContaining(['queued', 'cancelled', RUN_UUID]),
        );
        expect(tracker.history.insert).toHaveLength(2);
        expect(tracker.history.insert[0].bindings).toContain(
            'cancellation_requested',
        );
        expect(tracker.history.insert[1].bindings).toContain('status_changed');
    });

    it('records a cancellation request without declaring a running job cancelled', async () => {
        const requestedAt = new Date('2026-07-13T12:01:00.000Z');
        tracker.on.update(AiDeepResearchRunsTableName).responseOnce([]);
        tracker.on
            .update(AiDeepResearchRunsTableName)
            .responseOnce([runRow({ cancellation_requested_at: requestedAt })]);
        tracker.on.insert(AiDeepResearchEventsTableName).responseOnce([]);

        const run = await model.requestCancellation(RUN_UUID);

        expect(run).toEqual(runRow({ cancellation_requested_at: requestedAt }));
        expect(tracker.history.update).toHaveLength(2);
        expect(tracker.history.update[1].bindings).toEqual(
            expect.arrayContaining(['running', RUN_UUID]),
        );
        expect(tracker.history.insert).toHaveLength(1);
        expect(tracker.history.insert[0].bindings).toContain(
            'cancellation_requested',
        );
    });

    it('uses a stable created-at and uuid keyset for event pagination', async () => {
        tracker.on.select(AiDeepResearchEventsTableName).responseOnce([]);
        const createdAt = '2026-07-13 12:00:00.000001';

        await model.listEvents({
            aiDeepResearchRunUuid: RUN_UUID,
            cursor: { createdAt, eventUuid: EVENT_UUID },
            limit: 20,
        });

        const [select] = tracker.history.select;
        expect(select.sql).toContain(
            '(created_at, ai_deep_research_event_uuid) > ($2::timestamp, $3::uuid)',
        );
        expect(select.sql).toContain('order by "created_at" asc');
        expect(select.sql).toContain(
            '"ai_deep_research_event_uuid" asc limit $4',
        );
        expect(select.bindings).toEqual([RUN_UUID, createdAt, EVENT_UUID, 21]);
    });

    it('fails only stale running jobs and records a terminal event per run', async () => {
        tracker.on
            .update(AiDeepResearchRunsTableName)
            .responseOnce([
                runRow(),
                runRow({ ai_deep_research_run_uuid: 'run-2' }),
            ]);
        tracker.on.insert(AiDeepResearchEventsTableName).response([]);

        const runs = await model.markStaleRunsAsFailed(75, 'stale');

        expect(runs).toHaveLength(2);
        const [update] = tracker.history.update;
        expect(update.bindings).toEqual(
            expect.arrayContaining(['running', 75, 'failed', 'stale']),
        );
        expect(tracker.history.insert).toHaveLength(2);
    });
});
