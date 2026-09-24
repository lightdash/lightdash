import {
    ChartKind,
    DefaultSupportedDbtVersion,
    ProjectType,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

const SPACE_COUNT = 3;
const CHART_DELETE_SLEEP_SECONDS = 2;
const POLL_INTERVAL_MS = 25;
const POLL_DEADLINE_MS = 30_000;

type SlowDelete = { pid: number; holdsAppsLock: boolean };

const createProjectWithContent = async (
    database: Knex,
): Promise<{ projectUuid: string }> => {
    const [{ organization_id: organizationId }] = await database(
        'organizations',
    )
        .insert({ organization_name: `apps lock ${randomUUID()}` })
        .returning('organization_id');
    const [{ user_uuid: userUuid }] = await database('users')
        .insert({
            first_name: 'Apps',
            last_name: 'Lock',
            is_active: true,
            is_marketing_opted_in: false,
            is_setup_complete: true,
            is_tracking_anonymized: false,
        })
        .returning('user_uuid');
    const [{ project_id: projectId, project_uuid: projectUuid }] =
        await database('projects')
            .insert({
                name: 'preview',
                organization_id: organizationId,
                project_type: ProjectType.PREVIEW,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: DefaultSupportedDbtVersion,
                created_by_user_uuid: userUuid,
                organization_warehouse_credentials_uuid: null,
            })
            .returning(['project_id', 'project_uuid']);
    const spaces = await database('spaces')
        .insert(
            Array.from({ length: SPACE_COUNT }, (_, index) => ({
                name: `space ${index}`,
                slug: `space-${index}`,
                path: `space_${index}`,
                project_id: projectId,
                parent_space_uuid: null,
                inherit_parent_permissions: true,
                is_default_user_space: false,
            })),
        )
        .returning(['space_id', 'space_uuid']);
    await database('saved_queries').insert(
        spaces.map(({ space_id: spaceId }, index) => ({
            name: `chart ${index}`,
            slug: `chart-${index}`,
            description: undefined,
            last_version_chart_kind: ChartKind.TABLE,
            last_version_updated_by_user_uuid: userUuid,
            color_palette_uuid: null,
            project_uuid: projectUuid,
            space_id: spaceId,
            dashboard_uuid: null,
        })),
    );
    await database('apps').insert({
        project_uuid: projectUuid,
        created_by_user_uuid: userUuid,
        name: 'app',
        slug: 'app',
        space_uuid: spaces[0].space_uuid,
    });
    return { projectUuid };
};

const countChartDeletes = async (database: Knex): Promise<number> => {
    const { rows } = await database.raw<{ rows: { calls: string }[] }>(
        'SELECT CASE WHEN is_called THEN last_value ELSE 0 END AS calls FROM test_slow_chart_delete_calls',
    );
    return Number(rows[0].calls);
};

const waitForLastSlowChartDelete = async (
    database: Knex,
    callsBefore: number,
): Promise<SlowDelete> => {
    const deadline = Date.now() + POLL_DEADLINE_MS;
    const poll = async (): Promise<SlowDelete> => {
        const lastChartStarted =
            (await countChartDeletes(database)) >= callsBefore + SPACE_COUNT;
        const { rows } = await database.raw<{ rows: SlowDelete[] }>(
            `SELECT activity.pid AS "pid",
                    EXISTS (
                        SELECT 1 FROM pg_locks
                        WHERE pg_locks.pid = activity.pid
                          AND pg_locks.relation = 'apps'::regclass
                          AND pg_locks.granted
                    ) AS "holdsAppsLock"
             FROM pg_stat_activity AS activity
             WHERE activity.datname = current_database()
               AND activity.wait_event = 'PgSleep'`,
        );
        if (lastChartStarted && rows.length === 1) return rows[0];
        if (Date.now() > deadline) {
            throw new Error('The last slow chart delete never started');
        }
        await new Promise((resolve) => {
            setTimeout(resolve, POLL_INTERVAL_MS);
        });
        return poll();
    };
    return poll();
};

const alterAppsWithShortLockTimeout = async (database: Knex) => {
    const trx = await database.transaction();
    try {
        await trx.raw("SET LOCAL lock_timeout = '1s'");
        await trx.raw('ALTER TABLE apps ADD COLUMN spk_2356_probe text NULL');
    } finally {
        await trx.rollback();
    }
};

describe('project delete and migrations that alter apps', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let projectModel: ProjectModel;

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        await database.raw('CREATE SEQUENCE test_slow_chart_delete_calls');
        await database.raw(`
            CREATE FUNCTION test_slow_chart_delete() RETURNS trigger AS $$
            BEGIN
                PERFORM nextval('test_slow_chart_delete_calls');
                PERFORM pg_sleep(${CHART_DELETE_SLEEP_SECONDS});
                RETURN OLD;
            END
            $$ LANGUAGE plpgsql
        `);
        await database.raw(`
            CREATE TRIGGER test_slow_chart_delete
            BEFORE DELETE ON saved_queries
            FOR EACH ROW EXECUTE FUNCTION test_slow_chart_delete()
        `);
        projectModel = new ProjectModel({
            database,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil: new EncryptionUtil({
                lightdashConfig: lightdashConfigMock,
            }),
        });
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    test('a single delete transaction holds the apps lock through the slow chart cascade', async () => {
        const { projectUuid } = await createProjectWithContent(database);
        const callsBefore = await countChartDeletes(database);

        const deletion = database.transaction((trx) =>
            projectModel.delete(projectUuid, trx),
        );
        const slowDelete = await waitForLastSlowChartDelete(
            database,
            callsBefore,
        );

        expect(slowDelete.holdsAppsLock).toBe(true);
        await expect(alterAppsWithShortLockTimeout(database)).rejects.toThrow(
            /lock timeout/,
        );
        await deletion;
    });

    test('a batched delete keeps the slow chart cascade outside the apps lock', async () => {
        const { projectUuid } = await createProjectWithContent(database);
        const callsBefore = await countChartDeletes(database);

        const deletion = projectModel.delete(projectUuid);
        const slowDelete = await waitForLastSlowChartDelete(
            database,
            callsBefore,
        );

        expect(slowDelete.holdsAppsLock).toBe(false);
        await expect(
            alterAppsWithShortLockTimeout(database),
        ).resolves.toBeUndefined();
        await deletion;

        await expect(
            database('projects').where('project_uuid', projectUuid).first(),
        ).resolves.toBeUndefined();
        await expect(
            database('saved_queries').where('project_uuid', projectUuid),
        ).resolves.toEqual([]);
        await expect(
            database('apps').where('project_uuid', projectUuid),
        ).resolves.toEqual([]);
    });
});
