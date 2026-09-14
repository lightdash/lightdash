import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { type DbManagedAgentRun } from '../database/entities/managedAgent';
import { ManagedAgentModel } from './ManagedAgentModel';

const projectUuid = '11111111-1111-4111-8111-111111111111';
const organizationUuid = '22222222-2222-4222-8222-222222222222';

describe('ManagedAgentModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new ManagedAgentModel({
        database: database as unknown as Knex,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('skips the inactivity query when the project population is empty', async () => {
        tracker.on
            .any(/DISTINCT ON \(users\.user_uuid\)/i)
            .response({ rows: [] });
        tracker.on.any(() => true).response({ rows: [] });

        await expect(
            model.getInactiveUsers(projectUuid, organizationUuid, 30),
        ).resolves.toEqual([]);

        const executedSql = tracker.history.all.map((query) => query.sql);
        expect(executedSql).toHaveLength(1);
        expect(executedSql[0]).not.toContain("user_uuid in ('')");
    });

    describe('createRunIfIdle', () => {
        const runRow = {
            managed_agent_run_uuid: 'run-uuid',
            project_uuid: projectUuid,
            triggered_by: 'manual',
            status: 'started',
            session_id: null,
            started_at: new Date(),
            finished_at: null,
            action_count: 0,
            summary: null,
            error: null,
            current_activity: null,
        };

        it('closes stale runs, then creates a run when none is live', async () => {
            tracker.on.any(/pg_advisory_xact_lock/).response([]);
            tracker.on.any(/UPDATE managed_agent_runs/i).response(1);
            tracker.on.select(/managed_agent_runs/).response([]);
            tracker.on.insert(/managed_agent_runs/).response([runRow]);

            const run = await model.createRunIfIdle({
                projectUuid,
                triggeredBy: 'manual',
            });

            expect(run?.runUuid).toBe('run-uuid');
            const [lock, update] = tracker.history.all.map((q) => q.sql);
            expect(lock).toContain('pg_advisory_xact_lock');
            expect(update).toMatch(/update .*managed_agent_runs/i);
            expect(tracker.history.insert).toHaveLength(1);
        });

        it('returns null and inserts nothing while a run is live', async () => {
            tracker.on.any(/pg_advisory_xact_lock/).response([]);
            tracker.on.any(/UPDATE managed_agent_runs/i).response(0);
            tracker.on
                .select(/managed_agent_runs/)
                .response([{ managed_agent_run_uuid: 'live-run' }]);

            await expect(
                model.createRunIfIdle({ projectUuid, triggeredBy: 'cron' }),
            ).resolves.toBeNull();
            expect(tracker.history.insert).toHaveLength(0);
        });
    });
});

describe('ManagedAgentModel run attribution', () => {
    const row: DbManagedAgentRun = {
        managed_agent_run_uuid: 'run-uuid',
        project_uuid: projectUuid,
        triggered_by: 'manual',
        status: 'completed',
        session_id: null,
        started_at: new Date(),
        finished_at: new Date(),
        action_count: 0,
        summary: null,
        error: null,
        current_activity: null,
        created_at: new Date(),
        model_provider: 'azure',
        model_name: 'my-production-deployment',
    };

    it('returns the saved provider and deployment without re-resolving current settings', () => {
        expect(ManagedAgentModel.mapDbRun(row)).toMatchObject({
            modelProvider: 'azure',
            modelName: 'my-production-deployment',
        });
    });

    it('leaves historical model attribution unknown', () => {
        expect(
            ManagedAgentModel.mapDbRun({
                ...row,
                model_provider: null,
                model_name: null,
            }),
        ).toMatchObject({
            modelProvider: null,
            modelName: null,
        });
    });
});

describe('ManagedAgentModel latest run', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new ManagedAgentModel({
        database: database as unknown as Knex,
        encryptionUtil: {} as EncryptionUtil,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('aggregates action counts like the run list does', async () => {
        tracker.on.select(/managed_agent_runs/).response([
            {
                managed_agent_run_uuid: 'run-uuid',
                project_uuid: projectUuid,
                triggered_by: 'manual',
                status: 'completed',
                session_id: null,
                started_at: new Date(),
                finished_at: new Date(),
                action_count: 3,
                summary: null,
                error: null,
                current_activity: null,
                created_at: new Date(),
                model_provider: null,
                model_name: null,
                action_counts_by_type: { flagged_stale: 2, insight: 1 },
            },
        ]);

        const run = await model.getLatestRun(projectUuid);

        expect(run?.actionCountsByType).toEqual({
            flagged_stale: 2,
            insight: 1,
        });
        expect(tracker.history.select[0].sql).toContain('json_object_agg');
    });
});
