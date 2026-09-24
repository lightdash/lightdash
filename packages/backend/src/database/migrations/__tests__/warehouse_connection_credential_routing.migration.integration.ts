import {
    NotFoundError,
    NotImplementedError,
    WarehouseTypes,
    type CreatePostgresCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { type ConnectionBinding } from '../../../models/WarehouseConnectionRouter/WarehouseConnectionRouter';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

const SECRET = 'warehouse-connection-credential-routing-test-secret';

type CredentialsResult = CreateWarehouseCredentials & {
    userWarehouseCredentialsUuid: string | undefined;
};

type RoutedCredentials = {
    getWarehouseCredentials: (args: {
        projectUuid: string;
        userId: string;
        isRegisteredUser: boolean;
        binding: ConnectionBinding;
    }) => Promise<CredentialsResult>;
    getExtraConnectionWarehouseCredentials: (args: {
        projectUuid: string;
        warehouseConnectionUuid: string;
        userId: string;
        isRegisteredUser: boolean;
    }) => Promise<CredentialsResult>;
    refreshCredentials: (
        args: CreateWarehouseCredentials,
        userUuid: string,
    ) => Promise<CreateWarehouseCredentials>;
};

const originalCredentials: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'original.internal',
    user: 'original-user',
    password: 'original-password',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
    requireUserCredentials: false,
};

const extraConnectionCredentials: CreatePostgresCredentials = {
    ...originalCredentials,
    host: 'extra.internal',
    user: 'extra-user',
    password: 'extra-password',
};

const MULTIPLE_CONNECTIONS_REFUSAL = 'Multiple connections are not available';

const LANDED = ['PR 6', 'PR 7', 'PR 8', 'PR 10'];

type GuardOwnerRow =
    | {
          guard: string;
          owners: string[];
          probe: 'credentialRead';
          binding: (fixture: MultiFixture) => ConnectionBinding;
      }
    | {
          guard: string;
          owners: string[];
          probe: 'writeGuard';
          file: string;
          method: string;
      }
    | {
          guard: string;
          owners: string[];
          probe: 'addedGuard';
          file: string;
          method: string;
          marker: string;
      };

type MultiFixture = {
    userUuid: string;
    projectUuid: string;
    originalConnectionUuid: string;
    extraConnectionUuid: string;
};

const writeGuard = (
    guard: string,
    owners: string[],
    file: string,
    method: string,
): GuardOwnerRow => ({ guard, owners, probe: 'writeGuard', file, method });

const GUARD_OWNERS: GuardOwnerRow[] = [
    {
        guard: 'credential read original',
        owners: ['PR 6'],
        probe: 'credentialRead',
        binding: () => ({ kind: 'original' }),
    },
    {
        guard: 'credential read connection (NULL)',
        owners: ['PR 6'],
        probe: 'credentialRead',
        binding: () => ({ kind: 'connection', warehouseConnectionUuid: null }),
    },
    {
        guard: 'credential read connection (extra)',
        owners: ['PR 6'],
        probe: 'credentialRead',
        binding: ({ extraConnectionUuid }) => ({
            kind: 'connection',
            warehouseConnectionUuid: extraConnectionUuid,
        }),
    },
    {
        guard: 'credential read explore',
        owners: ['PR 7'],
        probe: 'credentialRead',
        binding: () => ({ kind: 'explore', exploreName: 'orders' }),
    },
    {
        guard: 'credential read sqlChart',
        owners: ['PR 8'],
        probe: 'credentialRead',
        binding: () => ({
            kind: 'sqlChart',
            savedSqlUuid: '00000000-0000-4000-8000-000000000000',
        }),
    },
    writeGuard(
        'G1',
        ['PR 7', 'PR 8'],
        'services/ProjectService/ProjectService.ts',
        'createWithoutCompile',
    ),
    writeGuard(
        'G2',
        ['PR 8'],
        'services/ProjectService/ProjectService.ts',
        '_create',
    ),
    writeGuard(
        'G3',
        ['PR 7', 'PR 10'],
        'services/ProjectService/ProjectService.ts',
        'setExplores',
    ),
    writeGuard(
        'G4',
        ['PR 7'],
        'services/ProjectService/ProjectService.ts',
        'testAndCompileProject',
    ),
    writeGuard(
        'G5',
        ['PR 7'],
        'services/ProjectService/ProjectService.ts',
        'compileProject',
    ),
    writeGuard(
        'G6',
        ['PR 8'],
        'services/ProjectService/ProjectService.ts',
        'copyContentOnPreview',
    ),
    writeGuard(
        'G7',
        ['PR 7', 'PR 8'],
        'services/ProjectService/ProjectService.ts',
        'createPreviewFromDbtCloudWebhook',
    ),
    writeGuard(
        'G8',
        ['PR 7', 'PR 10'],
        'services/DeployService.ts',
        'startDeploySession',
    ),
    writeGuard(
        'G9',
        ['PR 7', 'PR 10'],
        'services/DeployService.ts',
        'finalizeDeploy',
    ),
    writeGuard(
        'G10',
        ['PR 8'],
        'services/SavedSqlService/SavedSqlService.ts',
        'createSqlChart',
    ),
    writeGuard(
        'G11',
        ['PR 8'],
        'services/SavedSqlService/SavedSqlService.ts',
        'updateSqlChart',
    ),
    writeGuard(
        'G12',
        ['PR 7'],
        'services/ProjectDbtSourcesService.ts',
        'createProjectDbtSource',
    ),
    writeGuard(
        'G13',
        ['PR 7'],
        'services/ProjectDbtSourcesService.ts',
        'updateProjectDbtSource',
    ),
    writeGuard(
        'G14',
        ['PR 7'],
        'services/ProjectDbtSourcesService.ts',
        'deleteProjectDbtSource',
    ),
    writeGuard(
        'G15',
        ['PR 8', 'PR 10'],
        'services/CoderService/CoderService.ts',
        'upsertSqlChart',
    ),
    writeGuard(
        'G16',
        ['PR 8', 'PR 10'],
        'services/PromoteService/PromoteService.ts',
        'promoteSqlChart',
    ),
    writeGuard(
        'G17',
        ['PR 8', 'PR 10'],
        'services/PromoteService/PromoteService.ts',
        'promoteDashboard',
    ),
    writeGuard(
        'G18',
        ['PR 8'],
        'services/ProjectService/ProjectService.ts',
        'refreshTablesAndProjectConfig',
    ),
    {
        guard: 'A-5 original type change',
        owners: ['PR 6'],
        probe: 'addedGuard',
        file: 'models/ProjectModel/ProjectModel.ts',
        method: 'update',
        marker: 'ORIGINAL_TYPE_LOCKED_MESSAGE',
    },
];

const backendSource = path.resolve(__dirname, '../../..');

const methodSource = (file: string, method: string): string => {
    const source = readFileSync(path.join(backendSource, file), 'utf8');
    const start = source.search(
        new RegExp(
            `\\n    (?:(?:private|protected|public|static)\\s+)*(?:async\\s+)?${method}\\s*[<(]`,
        ),
    );
    if (start === -1) throw new Error(`${file} has no method ${method}`);
    const end = source.indexOf('\n    }\n', start);
    return source.slice(start, end);
};

const isLanded = (owners: string[]) =>
    owners.every((owner) => LANDED.includes(owner));

describe('Credential reads by connection binding on the real schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let encryptionUtil: EncryptionUtil;
    let projectModel: ProjectModel;
    let credentialsApi: RoutedCredentials;

    const encrypt = (value: unknown) =>
        encryptionUtil.encrypt(JSON.stringify(value));

    const createOrganization = async () => {
        const [organization] = await database('organizations')
            .insert({ organization_name: 'Routing test' })
            .returning(['organization_id', 'organization_uuid']);
        const [user] = await database('users')
            .insert({ first_name: 'Test', last_name: 'User' } as never)
            .returning('user_uuid');
        return {
            organizationId: organization.organization_id as number,
            userUuid: user.user_uuid as string,
        };
    };

    const createProject = async (
        organizationId: number,
        mode: 'single' | 'multi',
    ) => {
        const [project] = await database('projects')
            .insert({
                name: 'Routing project',
                organization_id: organizationId,
                connection_mode: mode,
            } as never)
            .returning(['project_id', 'project_uuid']);
        await database('warehouse_credentials').insert({
            project_id: project.project_id,
            warehouse_type: originalCredentials.type,
            encrypted_credentials: encrypt(originalCredentials),
        } as never);
        return project.project_uuid as string;
    };

    const addConnections = async (projectUuid: string) => {
        const [original] = await database('warehouse_connections')
            .insert({
                project_uuid: projectUuid,
                is_original: true,
                name: 'Original',
            })
            .returning('warehouse_connection_uuid');
        const [extra] = await database('warehouse_connections')
            .insert({
                project_uuid: projectUuid,
                is_original: false,
                name: 'Finance',
                warehouse_type: extraConnectionCredentials.type,
                encrypted_credentials: encrypt(extraConnectionCredentials),
            })
            .returning('warehouse_connection_uuid');
        return {
            originalConnectionUuid:
                original.warehouse_connection_uuid as string,
            extraConnectionUuid: extra.warehouse_connection_uuid as string,
        };
    };

    const createMultiProject = async (): Promise<MultiFixture> => {
        const { organizationId, userUuid } = await createOrganization();
        const projectUuid = await createProject(organizationId, 'multi');
        return {
            userUuid,
            projectUuid,
            ...(await addConnections(projectUuid)),
        };
    };

    const readCredentials = (
        projectUuid: string,
        userUuid: string,
        binding: ConnectionBinding,
    ) =>
        credentialsApi.getWarehouseCredentials({
            projectUuid,
            userId: userUuid,
            isRegisteredUser: true,
            binding,
        });

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        encryptionUtil = new EncryptionUtil({
            lightdashConfig: {
                lightdashSecret: SECRET,
                lightdashSecrets: {
                    active: SECRET,
                    fallbacks: [],
                    all: [SECRET],
                },
            },
        } as never);
        const organizationWarehouseCredentialsModel =
            new OrganizationWarehouseCredentialsModel({
                database,
                encryptionUtil,
            });
        projectModel = new ProjectModel({
            database,
            lightdashConfig: lightdashConfigMock,
            encryptionUtil,
        });
        credentialsApi = new ProjectService({
            lightdashConfig: lightdashConfigMock,
            projectModel,
            userWarehouseCredentialsModel: new UserWarehouseCredentialsModel({
                database,
                encryptionUtil,
            }),
            organizationWarehouseCredentialsModel,
            warehouseConnectionModel: new WarehouseConnectionModel({
                database,
                encryptionUtil,
                organizationWarehouseCredentialsModel,
            }),
        } as never) as unknown as RoutedCredentials;
    }, 600000);

    afterAll(async () => {
        await migrated?.destroy();
    });

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(credentialsApi, 'refreshCredentials').mockImplementation(
            async (args) => args,
        );
    });

    describe('a project that routes multi', () => {
        test.each<{
            name: string;
            binding: (fixture: MultiFixture) => ConnectionBinding;
        }>([
            { name: 'original', binding: () => ({ kind: 'original' }) },
            {
                name: 'connection NULL',
                binding: () => ({
                    kind: 'connection',
                    warehouseConnectionUuid: null,
                }),
            },
            {
                name: "connection with the original's own uuid",
                binding: ({ originalConnectionUuid }) => ({
                    kind: 'connection',
                    warehouseConnectionUuid: originalConnectionUuid,
                }),
            },
        ])(
            '$name loads the original through main code',
            async ({ binding }) => {
                const fixture = await createMultiProject();

                await expect(
                    readCredentials(
                        fixture.projectUuid,
                        fixture.userUuid,
                        binding(fixture),
                    ),
                ).resolves.toEqual({
                    ...originalCredentials,
                    userWarehouseCredentialsUuid: undefined,
                });
                await expect(
                    projectModel.getWarehouseCredentialsForBinding(
                        fixture.projectUuid,
                        binding(fixture),
                    ),
                ).resolves.toEqual(originalCredentials);
            },
        );

        test('connection with an extra uuid loads the extra connection', async () => {
            const fixture = await createMultiProject();
            const binding: ConnectionBinding = {
                kind: 'connection',
                warehouseConnectionUuid: fixture.extraConnectionUuid,
            };

            const routed = await readCredentials(
                fixture.projectUuid,
                fixture.userUuid,
                binding,
            );

            expect(routed).toMatchObject({
                host: 'extra.internal',
                user: 'extra-user',
                password: 'extra-password',
            });
            expect(routed).toEqual(
                await credentialsApi.getExtraConnectionWarehouseCredentials({
                    projectUuid: fixture.projectUuid,
                    warehouseConnectionUuid: fixture.extraConnectionUuid,
                    userId: fixture.userUuid,
                    isRegisteredUser: true,
                }),
            );
            await expect(
                projectModel.getWarehouseCredentialsForBinding(
                    fixture.projectUuid,
                    binding,
                ),
            ).rejects.toBeInstanceOf(NotImplementedError);
        });

        test.each<{
            name: string;
            uuid: (other: MultiFixture) => string;
        }>([
            {
                name: "another project's extra connection",
                uuid: (other) => other.extraConnectionUuid,
            },
            {
                name: "another project's original connection",
                uuid: (other) => other.originalConnectionUuid,
            },
            {
                name: 'an unknown connection',
                uuid: () => '6f2c1a38-94c6-4c5e-9b3f-2a8d0f7e1c55',
            },
            { name: 'a value that is not a uuid', uuid: () => 'finance' },
        ])(
            'connection with $name is refused and never loads the original',
            async ({ uuid }) => {
                const fixture = await createMultiProject();
                const other = await createMultiProject();
                const loadOriginal = vi.spyOn(
                    projectModel,
                    'getWarehouseCredentialsForProject',
                );
                const binding: ConnectionBinding = {
                    kind: 'connection',
                    warehouseConnectionUuid: uuid(other),
                };

                await expect(
                    readCredentials(
                        fixture.projectUuid,
                        fixture.userUuid,
                        binding,
                    ),
                ).rejects.toThrow(new NotFoundError('Connection not found'));
                await expect(
                    projectModel.getWarehouseCredentialsForBinding(
                        fixture.projectUuid,
                        binding,
                    ),
                ).rejects.toThrow(new NotFoundError('Connection not found'));
                expect(loadOriginal).not.toHaveBeenCalled();
            },
        );

        test.each<{ binding: ConnectionBinding; error: NotFoundError }>([
            {
                binding: {
                    kind: 'sqlChart',
                    savedSqlUuid: '00000000-0000-4000-8000-000000000000',
                },
                error: new NotFoundError('Saved sql not found'),
            },
            {
                binding: {
                    kind: 'query',
                    queryUuid: '00000000-0000-4000-8000-000000000000',
                },
                error: new NotFoundError(
                    'Query 00000000-0000-4000-8000-000000000000 not found in project',
                ),
            },
        ])(
            'a $binding.kind the project does not have is not found and never loads the original',
            async ({ binding, error }) => {
                const fixture = await createMultiProject();
                const loadOriginal = vi.spyOn(
                    projectModel,
                    'getWarehouseCredentialsForProject',
                );

                await expect(
                    readCredentials(
                        fixture.projectUuid,
                        fixture.userUuid,
                        binding,
                    ),
                ).rejects.toThrow(error.message);
                await expect(
                    projectModel.getWarehouseCredentialsForBinding(
                        fixture.projectUuid,
                        binding,
                    ),
                ).rejects.toThrow(error.message);
                expect(loadOriginal).not.toHaveBeenCalled();
            },
        );
    });

    describe('an explore binding on a project that routes multi', () => {
        const cacheExplore = (
            projectUuid: string,
            name: string,
            warehouseConnectionUuid: string | null,
        ) =>
            database('cached_explore').insert({
                project_uuid: projectUuid,
                name,
                table_names: [name],
                explore: JSON.stringify({ name }),
                warehouse_connection_uuid: warehouseConnectionUuid,
            } as never);

        test('an explore bound to NULL loads the original through main code', async () => {
            const fixture = await createMultiProject();
            await cacheExplore(fixture.projectUuid, 'orders', null);
            const binding: ConnectionBinding = {
                kind: 'explore',
                exploreName: 'orders',
            };

            await expect(
                readCredentials(fixture.projectUuid, fixture.userUuid, binding),
            ).resolves.toEqual({
                ...originalCredentials,
                userWarehouseCredentialsUuid: undefined,
            });
            await expect(
                projectModel.getWarehouseCredentialsForBinding(
                    fixture.projectUuid,
                    binding,
                ),
            ).resolves.toEqual(originalCredentials);
        });

        test("an explore bound to the original's uuid loads the original through main code", async () => {
            const fixture = await createMultiProject();
            await cacheExplore(
                fixture.projectUuid,
                'orders',
                fixture.originalConnectionUuid,
            );

            await expect(
                readCredentials(fixture.projectUuid, fixture.userUuid, {
                    kind: 'explore',
                    exploreName: 'orders',
                }),
            ).resolves.toEqual({
                ...originalCredentials,
                userWarehouseCredentialsUuid: undefined,
            });
        });

        test('a NULL-bound explore loads the original even when an extra-bound explore was cached first', async () => {
            const fixture = await createMultiProject();
            await cacheExplore(
                fixture.projectUuid,
                'payments',
                fixture.extraConnectionUuid,
            );
            await cacheExplore(fixture.projectUuid, 'orders', null);

            await expect(
                readCredentials(fixture.projectUuid, fixture.userUuid, {
                    kind: 'explore',
                    exploreName: 'orders',
                }),
            ).resolves.toEqual({
                ...originalCredentials,
                userWarehouseCredentialsUuid: undefined,
            });
        });

        test('an explore bound to an extra connection loads the extra connection', async () => {
            const fixture = await createMultiProject();
            await cacheExplore(
                fixture.projectUuid,
                'payments',
                fixture.extraConnectionUuid,
            );
            await cacheExplore(fixture.projectUuid, 'orders', null);
            const binding: ConnectionBinding = {
                kind: 'explore',
                exploreName: 'payments',
            };

            const routed = await readCredentials(
                fixture.projectUuid,
                fixture.userUuid,
                binding,
            );

            expect(routed).toEqual(
                await credentialsApi.getExtraConnectionWarehouseCredentials({
                    projectUuid: fixture.projectUuid,
                    warehouseConnectionUuid: fixture.extraConnectionUuid,
                    userId: fixture.userUuid,
                    isRegisteredUser: true,
                }),
            );
            expect(routed).toMatchObject({ host: 'extra.internal' });
            await expect(
                projectModel.getWarehouseCredentialsForBinding(
                    fixture.projectUuid,
                    binding,
                ),
            ).rejects.toBeInstanceOf(NotImplementedError);
        });

        test('an explore of another project is not found and never loads the original', async () => {
            const fixture = await createMultiProject();
            const other = await createMultiProject();
            await cacheExplore(
                other.projectUuid,
                'payments',
                other.extraConnectionUuid,
            );
            const loadOriginal = vi.spyOn(
                projectModel,
                'getWarehouseCredentialsForProject',
            );
            const binding: ConnectionBinding = {
                kind: 'explore',
                exploreName: 'payments',
            };

            await expect(
                readCredentials(fixture.projectUuid, fixture.userUuid, binding),
            ).rejects.toThrow(new NotFoundError('Explore not found'));
            await expect(
                projectModel.getWarehouseCredentialsForBinding(
                    fixture.projectUuid,
                    binding,
                ),
            ).rejects.toThrow(new NotFoundError('Explore not found'));
            expect(loadOriginal).not.toHaveBeenCalled();
        });
    });

    describe('a project that routes single', () => {
        test.each<{
            name: string;
            binding: (other: MultiFixture) => ConnectionBinding;
        }>([
            { name: 'original', binding: () => ({ kind: 'original' }) },
            {
                name: 'connection NULL',
                binding: () => ({
                    kind: 'connection',
                    warehouseConnectionUuid: null,
                }),
            },
            {
                name: "connection with another project's extra uuid",
                binding: (other) => ({
                    kind: 'connection',
                    warehouseConnectionUuid: other.extraConnectionUuid,
                }),
            },
            {
                name: 'explore',
                binding: () => ({ kind: 'explore', exploreName: 'orders' }),
            },
            {
                name: 'sqlChart',
                binding: () => ({
                    kind: 'sqlChart',
                    savedSqlUuid: '00000000-0000-4000-8000-000000000000',
                }),
            },
        ])(
            '$name loads the original through main code',
            async ({ binding }) => {
                const { organizationId, userUuid } = await createOrganization();
                const projectUuid = await createProject(
                    organizationId,
                    'single',
                );
                const other = await createMultiProject();

                await expect(
                    readCredentials(projectUuid, userUuid, binding(other)),
                ).resolves.toEqual({
                    ...originalCredentials,
                    userWarehouseCredentialsUuid: undefined,
                });
            },
        );

        test('a multi-mode project with no extra connection routes single', async () => {
            const { organizationId, userUuid } = await createOrganization();
            const projectUuid = await createProject(organizationId, 'multi');
            await database('warehouse_connections').insert({
                project_uuid: projectUuid,
                is_original: true,
                name: 'Original',
            });

            await expect(
                readCredentials(projectUuid, userUuid, {
                    kind: 'explore',
                    exploreName: 'orders',
                }),
            ).resolves.toEqual({
                ...originalCredentials,
                userWarehouseCredentialsUuid: undefined,
            });
        });
    });

    describe('guard owners (A-6)', () => {
        test.each(GUARD_OWNERS.map((row) => [row.guard, row] as const))(
            '%s',
            async (_guard, row) => {
                const landed = isLanded(row.owners);
                switch (row.probe) {
                    case 'credentialRead': {
                        const fixture = await createMultiProject();
                        const refusal = await readCredentials(
                            fixture.projectUuid,
                            fixture.userUuid,
                            row.binding(fixture),
                        ).then(
                            () => null,
                            (error: Error) => error,
                        );
                        if (landed) {
                            expect(refusal).not.toBeInstanceOf(
                                NotImplementedError,
                            );
                        } else {
                            expect(refusal).toEqual(
                                new NotImplementedError(
                                    MULTIPLE_CONNECTIONS_REFUSAL,
                                ),
                            );
                        }
                        break;
                    }
                    case 'writeGuard':
                        expect(
                            methodSource(row.file, row.method).includes(
                                'requireSingleConnectionRoute(',
                            ),
                        ).toBe(!landed);
                        break;
                    case 'addedGuard':
                        expect(
                            methodSource(row.file, row.method).includes(
                                row.marker,
                            ),
                        ).toBe(landed);
                        break;
                    default:
                        throw new Error('Unknown guard probe');
                }
            },
        );
    });
});
