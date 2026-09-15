import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { ManagedAgentModel } from './ManagedAgentModel';

const projectUuid = '11111111-1111-4111-8111-111111111111';
const organizationUuid = '22222222-2222-4222-8222-222222222222';

describe('ManagedAgentModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const encryptionUtil = new EncryptionUtil({
        lightdashConfig: {
            lightdashSecret: 'test-secret',
            lightdashSecrets: {
                active: 'test-secret',
                fallbacks: [],
                all: ['test-secret'],
            },
        },
    });
    const model = new ManagedAgentModel({
        database: database as unknown as Knex,
        encryptionUtil,
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
