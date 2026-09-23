import { NotImplementedError } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    connectionModeTestDatabaseUri,
    createStandInConnectionModeSchema,
    inRolledBackTransaction,
    insertRoutingTestProject,
    setProjectRoutesMulti,
} from './connectionModeSchema.testUtils';
import { WarehouseConnectionRouter } from './WarehouseConnectionRouter';

const sentryRecorder = vi.hoisted(() => ({
    tags: new Map<string, string>(),
    attributes: new Map<string, unknown>(),
}));

vi.mock('@sentry/node', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@sentry/node')>();
    return {
        ...actual,
        setTag: (key: string, value: string) => {
            sentryRecorder.tags.set(key, value);
        },
        getActiveSpan: () => ({
            spanContext: () => ({
                traceId: '00000000000000000000000000000000',
                spanId: '0000000000000000',
                traceFlags: 0,
            }),
            setAttributes: (attributes: Record<string, unknown>) => {
                Object.entries(attributes).forEach(([key, value]) =>
                    sentryRecorder.attributes.set(key, value),
                );
            },
        }),
    };
});

describe('WarehouseConnectionRouter on the real schema', () => {
    let database: Knex;
    const encryptionUtil = new EncryptionUtil({
        lightdashConfig: lightdashConfigMock,
    });

    beforeAll(() => {
        database = knex({
            client: 'pg',
            connection: { connectionString: connectionModeTestDatabaseUri() },
            pool: { min: 0, max: 4 },
        });
    });

    afterAll(async () => {
        await database.destroy();
    });

    beforeEach(() => {
        sentryRecorder.tags.clear();
        sentryRecorder.attributes.clear();
    });

    test('routes single when projects.connection_mode does not exist', async () => {
        const fixture = await insertRoutingTestProject(
            database,
            encryptionUtil,
        );
        try {
            await expect(
                new WarehouseConnectionRouter({ database }).getRoute(
                    fixture.projectUuid,
                ),
            ).resolves.toBe('single');
        } finally {
            await database('organizations')
                .where('organization_id', fixture.organizationId)
                .delete();
        }
    });

    test('reads connection_mode on the next call once the column appears', async () => {
        const probeSchema = `routing_probe_${process.pid}`;
        const probeDatabase = knex({
            client: 'pg',
            connection: { connectionString: connectionModeTestDatabaseUri() },
            searchPath: [probeSchema, 'public'],
            pool: { min: 0, max: 1 },
        });
        try {
            await probeDatabase.raw('CREATE SCHEMA ??', [probeSchema]);
            await probeDatabase.raw(
                'CREATE TABLE ??.projects (LIKE public.projects INCLUDING ALL)',
                [probeSchema],
            );
            const inserted = await probeDatabase.raw<{
                rows: { project_uuid: string }[];
            }>(
                'INSERT INTO projects (name, organization_id) VALUES (?, ?) RETURNING project_uuid',
                ['Routing probe project', 1],
            );
            const [project] = inserted.rows;
            const router = new WarehouseConnectionRouter({
                database: probeDatabase,
            });

            await expect(router.getRoute(project.project_uuid)).resolves.toBe(
                'single',
            );

            await createStandInConnectionModeSchema(probeDatabase);
            await setProjectRoutesMulti(probeDatabase, project.project_uuid, [
                { name: 'Finance', isOriginal: false },
            ]);

            await expect(router.getRoute(project.project_uuid)).resolves.toBe(
                'multi',
            );
        } finally {
            await probeDatabase.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [
                probeSchema,
            ]);
            await probeDatabase.destroy();
        }
    });

    test('routes single for an unknown project so the caller reports its own error', async () => {
        await inRolledBackTransaction(database, async (transaction) => {
            await createStandInConnectionModeSchema(transaction);
            await expect(
                new WarehouseConnectionRouter({
                    database: transaction,
                }).getRoute('00000000-0000-4000-8000-00000000abcd'),
            ).resolves.toBe('single');
        });
    });

    test('routes single for a single-mode project without reading warehouse_connections', async () => {
        await inRolledBackTransaction(database, async (transaction) => {
            await createStandInConnectionModeSchema(transaction);
            const { projectUuid } = await insertRoutingTestProject(
                transaction,
                encryptionUtil,
            );
            const statements: string[] = [];
            const recordStatement = (query: { sql: string }) => {
                statements.push(query.sql);
            };
            database.on('query', recordStatement);
            try {
                await expect(
                    new WarehouseConnectionRouter({
                        database: transaction,
                    }).getRoute(projectUuid),
                ).resolves.toBe('single');
            } finally {
                database.removeListener('query', recordStatement);
            }
            expect(statements.length).toBeGreaterThan(0);
            expect(
                statements.filter((sql) =>
                    sql.includes('warehouse_connections'),
                ),
            ).toEqual([]);
        });
    });

    test('routes multi for a multi-mode project with an extra connection', async () => {
        await inRolledBackTransaction(database, async (transaction) => {
            await createStandInConnectionModeSchema(transaction);
            const { projectUuid } = await insertRoutingTestProject(
                transaction,
                encryptionUtil,
            );
            await setProjectRoutesMulti(transaction, projectUuid, [
                { name: 'Original', isOriginal: true },
                { name: 'Finance', isOriginal: false },
            ]);
            await expect(
                new WarehouseConnectionRouter({
                    database: transaction,
                }).getRoute(projectUuid),
            ).resolves.toBe('multi');
        });
    });

    test('routes single for a multi-mode project with no extra connection', async () => {
        await inRolledBackTransaction(database, async (transaction) => {
            await createStandInConnectionModeSchema(transaction);
            const { projectUuid } = await insertRoutingTestProject(
                transaction,
                encryptionUtil,
            );
            await setProjectRoutesMulti(transaction, projectUuid, [
                { name: 'Original', isOriginal: true },
            ]);
            await expect(
                new WarehouseConnectionRouter({
                    database: transaction,
                }).getRoute(projectUuid),
            ).resolves.toBe('single');
        });
    });

    test('refuses a multi route and tags the route and binding kind', async () => {
        await inRolledBackTransaction(database, async (transaction) => {
            await createStandInConnectionModeSchema(transaction);
            const { projectUuid } = await insertRoutingTestProject(
                transaction,
                encryptionUtil,
            );
            await setProjectRoutesMulti(transaction, projectUuid, [
                { name: 'Finance', isOriginal: false },
            ]);
            await expect(
                new WarehouseConnectionRouter({
                    database: transaction,
                }).requireSingleRoute(projectUuid, {
                    kind: 'connection',
                    warehouseConnectionUuid: null,
                }),
            ).rejects.toThrow(NotImplementedError);
            expect(sentryRecorder.tags.get('warehouse.route')).toBe('multi');
            expect(sentryRecorder.tags.get('warehouse.binding_kind')).toBe(
                'connection',
            );
            expect(sentryRecorder.attributes.get('warehouse.route')).toBe(
                'multi',
            );
            expect(
                sentryRecorder.attributes.get('warehouse.binding_kind'),
            ).toBe('connection');
        });
    });
});
