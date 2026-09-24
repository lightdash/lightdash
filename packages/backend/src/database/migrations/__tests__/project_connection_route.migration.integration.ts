import { WarehouseTypes } from '@lightdash/common';
import { type Knex } from 'knex';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import {
    inRolledBackTransaction,
    insertRoutingTestProject,
    setProjectRoutesMulti,
    withProjectsCopy,
    withProjectsWithoutConnectionMode,
} from '../../../models/WarehouseConnectionRouter/connectionModeSchema.testUtils';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import {
    createMigratedTestDatabase,
    type MigratedTestDatabase,
} from './migratedTestDatabase';

describe('ProjectModel connection routing on the real schema', () => {
    let migrated: MigratedTestDatabase;
    let database: Knex;
    const encryptionUtil = new EncryptionUtil({
        lightdashConfig: lightdashConfigMock,
    });

    const projectModelFor = (target: Knex) =>
        new ProjectModel({
            database: target,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil,
        });

    const connection = () =>
        database.client.config.connection as Knex.StaticConnectionConfig;

    beforeAll(async () => {
        migrated = await createMigratedTestDatabase('project_connection_route');
        database = migrated.database;
    }, 600000);

    afterAll(async () => {
        await migrated?.destroy();
    });

    describe('before the connection modes migration', () => {
        let fixture: { organizationId: number; projectUuid: string };

        beforeAll(async () => {
            fixture = await insertRoutingTestProject(database, encryptionUtil);
        });

        afterAll(async () => {
            await database('organizations')
                .where('organization_id', fixture.organizationId)
                .delete();
        });

        test('resolves a binding to the same credentials as main', async () => {
            await withProjectsWithoutConnectionMode(
                fixture.projectUuid,
                async (databaseWithoutColumn) => {
                    const projectModel = projectModelFor(databaseWithoutColumn);
                    const direct =
                        await projectModel.getWarehouseCredentialsForProject(
                            fixture.projectUuid,
                        );
                    const routed =
                        await projectModel.getWarehouseCredentialsForBinding(
                            fixture.projectUuid,
                            { kind: 'original' },
                        );
                    expect(routed).toEqual(direct);
                    expect(routed).toMatchObject({
                        type: WarehouseTypes.POSTGRES,
                        host: 'warehouse.internal',
                        password: 'analyst-password',
                    });
                },
                connection(),
            );
        });

        test('reports connectionRoute single on the project', async () => {
            await withProjectsWithoutConnectionMode(
                fixture.projectUuid,
                async (databaseWithoutColumn) => {
                    const project = await projectModelFor(
                        databaseWithoutColumn,
                    ).get(fixture.projectUuid);
                    expect(project.connectionRoute).toBe('single');
                },
                connection(),
            );
        });
    });

    describe('when the route query fails', () => {
        let fixture: { organizationId: number; projectUuid: string };

        beforeAll(async () => {
            fixture = await insertRoutingTestProject(database, encryptionUtil);
        });

        afterAll(async () => {
            await database('organizations')
                .where('organization_id', fixture.organizationId)
                .delete();
        });

        const withBrokenExtraConnections = (
            run: (brokenDatabase: Knex) => Promise<void>,
        ) =>
            withProjectsCopy(
                fixture.projectUuid,
                [
                    `UPDATE :schema.projects SET connection_mode = 'multi'`,
                    'CREATE TABLE :schema.warehouse_connections (warehouse_connection_uuid uuid, project_uuid uuid)',
                ],
                run,
                connection(),
            );

        test('get rejects instead of routing single', async () => {
            await withBrokenExtraConnections(async (brokenDatabase) => {
                await expect(
                    projectModelFor(brokenDatabase).get(fixture.projectUuid),
                ).rejects.toThrow('is_original');
            });
        });

        test('credential resolution rejects instead of routing single', async () => {
            await withBrokenExtraConnections(async (brokenDatabase) => {
                await expect(
                    projectModelFor(
                        brokenDatabase,
                    ).getWarehouseCredentialsForBinding(fixture.projectUuid, {
                        kind: 'original',
                    }),
                ).rejects.toThrow('is_original');
            });
        });
    });

    describe('with the connection modes schema', () => {
        test('resolves a single-mode project to the same credentials as main', async () => {
            await inRolledBackTransaction(database, async (transaction) => {
                const { projectUuid } = await insertRoutingTestProject(
                    transaction,
                    encryptionUtil,
                );
                const projectModel = projectModelFor(transaction);
                await expect(
                    projectModel.getWarehouseCredentialsForBinding(
                        projectUuid,
                        { kind: 'explore', exploreName: 'orders' },
                    ),
                ).resolves.toEqual(
                    await projectModel.getWarehouseCredentialsForProject(
                        projectUuid,
                    ),
                );
            });
        });

        test.each([
            { kind: 'connection' as const, warehouseConnectionUuid: null },
            { kind: 'original' as const },
        ])(
            'loads the original credentials for a project that routes multi with a $kind binding',
            async (binding) => {
                await inRolledBackTransaction(database, async (transaction) => {
                    const { projectUuid } = await insertRoutingTestProject(
                        transaction,
                        encryptionUtil,
                    );
                    await setProjectRoutesMulti(transaction, projectUuid, [
                        { name: 'Finance', isOriginal: false },
                    ]);
                    const projectModel = projectModelFor(transaction);
                    await expect(
                        projectModel.getWarehouseCredentialsForBinding(
                            projectUuid,
                            binding,
                        ),
                    ).resolves.toEqual(
                        await projectModel.getWarehouseCredentialsForProject(
                            projectUuid,
                        ),
                    );
                });
            },
        );

        test('refuses to load an extra connection through the project model, which loads it per user', async () => {
            await inRolledBackTransaction(database, async (transaction) => {
                const { projectUuid } = await insertRoutingTestProject(
                    transaction,
                    encryptionUtil,
                );
                await setProjectRoutesMulti(transaction, projectUuid, [
                    { name: 'Finance', isOriginal: false },
                ]);
                const [extra] = await transaction('warehouse_connections')
                    .where('project_uuid', projectUuid)
                    .where('is_original', false)
                    .select('warehouse_connection_uuid');
                await expect(
                    projectModelFor(
                        transaction,
                    ).getWarehouseCredentialsForBinding(projectUuid, {
                        kind: 'connection',
                        warehouseConnectionUuid:
                            extra.warehouse_connection_uuid,
                    }),
                ).rejects.toThrow('Extra connection credentials load per user');
            });
        });

        test('reports each project route from its own mode and extra connections', async () => {
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
                const projectModel = projectModelFor(transaction);
                expect(
                    (await projectModel.get(multiWithExtra.projectUuid))
                        .connectionRoute,
                ).toBe('multi');
                expect(
                    (await projectModel.get(singleWithStrayExtra.projectUuid))
                        .connectionRoute,
                ).toBe('single');
                expect(
                    (await projectModel.get(multiWithoutExtra.projectUuid))
                        .connectionRoute,
                ).toBe('single');
            });
        });

        test('reads a single project with exactly the one select main issues', async () => {
            await inRolledBackTransaction(database, async (transaction) => {
                const { projectUuid } = await insertRoutingTestProject(
                    transaction,
                    encryptionUtil,
                );
                const projectModel = projectModelFor(transaction);
                const statements: string[] = [];
                const recordStatement = (query: { sql: string }) => {
                    statements.push(query.sql);
                };
                database.on('query', recordStatement);
                try {
                    const project = await projectModel.get(projectUuid);
                    expect(project.connectionRoute).toBe('single');
                } finally {
                    database.removeListener('query', recordStatement);
                }
                expect(statements).toHaveLength(1);
                expect(statements[0]).toContain('"connection_mode"');
            });
        });

        test('reads a multi project with one more query for its extra connections', async () => {
            await inRolledBackTransaction(database, async (transaction) => {
                const { projectUuid } = await insertRoutingTestProject(
                    transaction,
                    encryptionUtil,
                );
                await setProjectRoutesMulti(transaction, projectUuid, [
                    { name: 'Finance', isOriginal: false },
                ]);
                const projectModel = projectModelFor(transaction);
                const statements: string[] = [];
                const recordStatement = (query: { sql: string }) => {
                    statements.push(query.sql);
                };
                database.on('query', recordStatement);
                try {
                    const project = await projectModel.get(projectUuid);
                    expect(project.connectionRoute).toBe('multi');
                } finally {
                    database.removeListener('query', recordStatement);
                }
                expect(statements).toHaveLength(2);
                expect(statements[1]).toContain('"warehouse_connections"');
            });
        });

        test('reports connectionRoute multi on a project with an extra connection', async () => {
            await inRolledBackTransaction(database, async (transaction) => {
                const { projectUuid } = await insertRoutingTestProject(
                    transaction,
                    encryptionUtil,
                );
                await setProjectRoutesMulti(transaction, projectUuid, [
                    { name: 'Finance', isOriginal: false },
                ]);
                const project =
                    await projectModelFor(transaction).get(projectUuid);
                expect(project.connectionRoute).toBe('multi');
            });
        });

        test('reports connectionRoute single on a multi-mode project with no extra connection', async () => {
            await inRolledBackTransaction(database, async (transaction) => {
                const { projectUuid } = await insertRoutingTestProject(
                    transaction,
                    encryptionUtil,
                );
                await setProjectRoutesMulti(transaction, projectUuid, [
                    { name: 'Original', isOriginal: true },
                ]);
                const project =
                    await projectModelFor(transaction).get(projectUuid);
                expect(project.connectionRoute).toBe('single');
            });
        });
    });
});
