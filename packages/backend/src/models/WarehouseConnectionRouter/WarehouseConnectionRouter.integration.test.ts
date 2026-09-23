import { NotImplementedError } from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    connectionModeTestDatabaseUri,
    inRolledBackTransaction,
    insertRoutingTestProject,
    setProjectRoutesMulti,
    withProjectsCopy,
    withProjectsWithoutConnectionMode,
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
            await withProjectsWithoutConnectionMode(
                fixture.projectUuid,
                async (databaseWithoutColumn) => {
                    await expect(
                        new WarehouseConnectionRouter({
                            database: databaseWithoutColumn,
                        }).getRoute(fixture.projectUuid),
                    ).resolves.toBe('single');
                },
            );
        } finally {
            await database('organizations')
                .where('organization_id', fixture.organizationId)
                .delete();
        }
    });

    test('reads connection_mode on the next call once the column appears', async () => {
        const fixture = await insertRoutingTestProject(
            database,
            encryptionUtil,
        );
        try {
            await withProjectsWithoutConnectionMode(
                fixture.projectUuid,
                async (databaseWithoutColumn) => {
                    const router = new WarehouseConnectionRouter({
                        database: databaseWithoutColumn,
                    });
                    await expect(
                        router.getRoute(fixture.projectUuid),
                    ).resolves.toBe('single');

                    await databaseWithoutColumn.raw(
                        `ALTER TABLE projects ADD COLUMN connection_mode text NOT NULL DEFAULT 'single'`,
                    );
                    await setProjectRoutesMulti(
                        databaseWithoutColumn,
                        fixture.projectUuid,
                        [{ name: 'Finance', isOriginal: false }],
                    );

                    await expect(
                        router.getRoute(fixture.projectUuid),
                    ).resolves.toBe('multi');
                },
            );
        } finally {
            await database('organizations')
                .where('organization_id', fixture.organizationId)
                .delete();
        }
    });

    test('rejects when the mode query fails on another column', async () => {
        const fixture = await insertRoutingTestProject(
            database,
            encryptionUtil,
        );
        try {
            await withProjectsCopy(
                fixture.projectUuid,
                ['ALTER TABLE :schema.projects DROP COLUMN project_uuid'],
                async (brokenDatabase) => {
                    await expect(
                        new WarehouseConnectionRouter({
                            database: brokenDatabase,
                        }).getRoute(fixture.projectUuid),
                    ).rejects.toThrow('project_uuid');
                },
            );
        } finally {
            await database('organizations')
                .where('organization_id', fixture.organizationId)
                .delete();
        }
    });

    test('rejects when the extra-connection query fails', async () => {
        const fixture = await insertRoutingTestProject(
            database,
            encryptionUtil,
        );
        try {
            await withProjectsCopy(
                fixture.projectUuid,
                [
                    `UPDATE :schema.projects SET connection_mode = 'multi'`,
                    'CREATE TABLE :schema.warehouse_connections (warehouse_connection_uuid uuid, project_uuid uuid)',
                ],
                async (brokenDatabase) => {
                    await expect(
                        new WarehouseConnectionRouter({
                            database: brokenDatabase,
                        }).getRoute(fixture.projectUuid),
                    ).rejects.toThrow('is_original');
                },
            );
        } finally {
            await database('organizations')
                .where('organization_id', fixture.organizationId)
                .delete();
        }
    });

    test('rejects inside a failed transaction', async () => {
        await inRolledBackTransaction(database, async (transaction) => {
            const { projectUuid } = await insertRoutingTestProject(
                transaction,
                encryptionUtil,
            );
            await transaction.raw('SELECT 1 / 0').catch(() => undefined);
            await expect(
                new WarehouseConnectionRouter({
                    database: transaction,
                }).getRoute(projectUuid),
            ).rejects.toThrow('current transaction is aborted');
        });
    });

    test('routes each project by its own mode and its own extra connections', async () => {
        await inRolledBackTransaction(database, async (transaction) => {
            const multiWithExtra = await insertRoutingTestProject(
                transaction,
                encryptionUtil,
            );
            const singleWithStrayExtra = await insertRoutingTestProject(
                transaction,
                encryptionUtil,
            );
            const multiWithoutExtra = await insertRoutingTestProject(
                transaction,
                encryptionUtil,
            );
            await setProjectRoutesMulti(
                transaction,
                multiWithExtra.projectUuid,
                [{ name: 'Finance', isOriginal: false }],
            );
            await transaction('warehouse_connections').insert({
                project_uuid: singleWithStrayExtra.projectUuid,
                is_original: false,
                name: 'Stray',
                warehouse_type: 'postgres',
                encrypted_credentials: Buffer.from('extra-ciphertext'),
            });
            await setProjectRoutesMulti(
                transaction,
                multiWithoutExtra.projectUuid,
                [{ name: 'Original', isOriginal: true }],
            );
            const router = new WarehouseConnectionRouter({
                database: transaction,
            });
            await expect(
                router.getRoute(multiWithExtra.projectUuid),
            ).resolves.toBe('multi');
            await expect(
                router.getRoute(singleWithStrayExtra.projectUuid),
            ).resolves.toBe('single');
            await expect(
                router.getRoute(multiWithoutExtra.projectUuid),
            ).resolves.toBe('single');
        });
    });

    test('routes single for an unknown project so the caller reports its own error', async () => {
        await inRolledBackTransaction(database, async (transaction) => {
            await expect(
                new WarehouseConnectionRouter({
                    database: transaction,
                }).getRoute('00000000-0000-4000-8000-00000000abcd'),
            ).resolves.toBe('single');
        });
    });

    test('routes single for a single-mode project without reading warehouse_connections', async () => {
        await inRolledBackTransaction(database, async (transaction) => {
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
