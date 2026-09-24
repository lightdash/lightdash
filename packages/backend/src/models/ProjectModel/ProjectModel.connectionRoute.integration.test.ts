import { WarehouseTypes } from '@lightdash/common';
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
} from '../WarehouseConnectionRouter/connectionModeSchema.testUtils';
import { ProjectModel } from './ProjectModel';

describe('ProjectModel connection routing on the real schema', () => {
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
            { kind: 'explore' as const, exploreName: 'orders' },
            {
                kind: 'sqlChart' as const,
                savedSqlUuid: 'b1c2d3e4-0000-4000-8000-000000000001',
            },
            { kind: 'connection' as const, warehouseConnectionUuid: null },
            { kind: 'original' as const },
        ])(
            'refuses credentials for a project that routes multi with a $kind binding',
            async (binding) => {
                await inRolledBackTransaction(database, async (transaction) => {
                    const { projectUuid } = await insertRoutingTestProject(
                        transaction,
                        encryptionUtil,
                    );
                    await setProjectRoutesMulti(transaction, projectUuid, [
                        { name: 'Finance', isOriginal: false },
                    ]);
                    await expect(
                        projectModelFor(
                            transaction,
                        ).getWarehouseCredentialsForBinding(
                            projectUuid,
                            binding,
                        ),
                    ).rejects.toThrow('Multiple connections are not available');
                });
            },
        );

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
