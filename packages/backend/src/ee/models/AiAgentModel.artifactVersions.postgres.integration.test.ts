import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { AiAgentModel } from './AiAgentModel';

// Concurrent writes need separate connections, so the tables live in a
// throwaway schema instead of per-session temp tables.
describe('AiAgentModel.createOrUpdateArtifact concurrency (PostgreSQL)', () => {
    const schema = `artifact_versions_${randomUUID().replaceAll('-', '')}`;
    let database: Knex;
    let model: AiAgentModel;

    beforeAll(async () => {
        if (!process.env.PGDATABASE && !process.env.PGCONNECTIONURI)
            throw new Error(
                'Set PGCONNECTIONURI or PG connection variables for PostgreSQL tests',
            );
        const connection = process.env.PGCONNECTIONURI ?? {
            host: process.env.PGHOST,
            port: Number(process.env.PGPORT ?? 5432),
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            database: process.env.PGDATABASE,
        };
        const admin = knex({ client: 'pg', connection });
        await admin.raw(`CREATE SCHEMA ${schema}`);
        await admin.destroy();

        database = knex({
            client: 'pg',
            connection,
            searchPath: [schema],
            pool: { min: 0, max: 10 },
        });
        await database.raw(`
            CREATE TABLE ai_thread (ai_thread_uuid uuid PRIMARY KEY);
            CREATE TABLE ai_artifacts (
                ai_artifact_uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                ai_thread_uuid uuid NOT NULL REFERENCES ai_thread,
                artifact_type text NOT NULL,
                created_at timestamptz NOT NULL DEFAULT now()
            );
            CREATE TABLE ai_artifact_versions (
                ai_artifact_version_uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                ai_artifact_uuid uuid NOT NULL REFERENCES ai_artifacts,
                ai_prompt_uuid uuid,
                created_at timestamptz NOT NULL DEFAULT now(),
                version_number integer NOT NULL,
                title text,
                description text,
                saved_query_uuid uuid,
                saved_sql_uuid uuid,
                saved_dashboard_uuid uuid,
                saved_composer_chart_uuid uuid,
                chart_config jsonb,
                dashboard_config jsonb,
                verified_by_user_uuid uuid,
                verified_at timestamptz,
                UNIQUE (ai_artifact_uuid, version_number)
            );
            CREATE TABLE composer_charts (
                composer_chart_uuid uuid PRIMARY KEY,
                dashboard_uuid uuid,
                deleted_at timestamptz
            );
        `);
        model = new AiAgentModel({ database } as ConstructorParameters<
            typeof AiAgentModel
        >[0]);
    });

    afterAll(async () => {
        await database?.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await database?.destroy();
    });

    const createThread = async () => {
        const threadUuid = randomUUID();
        await database.raw('INSERT INTO ai_thread VALUES (?)', [threadUuid]);
        return threadUuid;
    };

    const writeChart = (threadUuid: string, title: string) =>
        model.createOrUpdateArtifact({
            threadUuid,
            promptUuid: randomUUID(),
            artifactType: 'chart',
            title,
            vizConfig: { title },
        });

    it('gives every parallel write on an existing artifact its own version', async () => {
        const threadUuid = await createThread();
        const first = await writeChart(threadUuid, 'first');

        const results = await Promise.allSettled(
            Array.from({ length: 6 }, (_, i) =>
                writeChart(threadUuid, `parallel ${i}`),
            ),
        );

        expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
        const versions = await database('ai_artifact_versions')
            .where('ai_artifact_uuid', first.artifactUuid)
            .orderBy('version_number')
            .pluck('version_number');
        expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('creates one artifact when parallel writes start a thread', async () => {
        const threadUuid = await createThread();

        const results = await Promise.all(
            Array.from({ length: 4 }, (_, i) =>
                writeChart(threadUuid, `parallel ${i}`),
            ),
        );

        expect(new Set(results.map((r) => r.artifactUuid)).size).toBe(1);
        expect(results.map((r) => r.versionNumber).sort()).toEqual([
            1, 2, 3, 4,
        ]);
    });
});
