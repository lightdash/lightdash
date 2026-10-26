import {
    assertUnreachable,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    NotFoundError,
    ProjectType,
    WarehouseTypes,
    type AiServiceAccountSlot,
    type CreateWarehouseCredentials,
    type ProjectSummary,
    type WarehouseConnection,
} from '@lightdash/common';
import { type AiServiceAccountSecrets } from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import {
    athenaConnection,
    athenaSecrets,
    clickhouseConnection,
    clickhouseSecrets,
    postgresConnection,
    postgresSecrets,
    redshiftConnection,
    redshiftSecrets,
    snowflakeSecrets,
    trinoConnection,
    trinoSecrets,
} from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel.mock';
import {
    AiServiceAccountDestinationMismatchError,
    AiServiceAccountSlotResolutionError,
    AiServiceAccountSlotResolver,
    type AiServiceAccountSlotDependencies,
} from './resolveAiServiceAccountSlot';

describe.each([
    WarehouseTypes.POSTGRES,
    WarehouseTypes.CLICKHOUSE,
    WarehouseTypes.REDSHIFT,
    WarehouseTypes.TRINO,
    WarehouseTypes.BIGQUERY,
    WarehouseTypes.SNOWFLAKE,
    WarehouseTypes.DATABRICKS,
    WarehouseTypes.ATHENA,
] as const)('%s slot inheritance', (warehouseType) => {
    const record = (projectUuid: string, identityUuid = 'generation-1') => ({
        slot: {
            uuid: `${projectUuid}-slot`,
            projectUuid,
            identityUuid,
        } as AiServiceAccountSlot,
        secrets: ((): AiServiceAccountSecrets => {
            switch (warehouseType) {
                case WarehouseTypes.POSTGRES:
                    return postgresSecrets;
                case WarehouseTypes.TRINO:
                    return trinoSecrets;
                case WarehouseTypes.CLICKHOUSE:
                    return clickhouseSecrets;
                case WarehouseTypes.REDSHIFT:
                    return redshiftSecrets;
                case WarehouseTypes.SNOWFLAKE:
                    return snowflakeSecrets;
                case WarehouseTypes.DATABRICKS:
                    return {
                        type: WarehouseTypes.DATABRICKS,
                        authenticationType:
                            DatabricksAuthenticationType.OAUTH_M2M,
                        oauthClientId: 'id',
                        oauthClientSecret: 'secret',
                    };
                case WarehouseTypes.ATHENA:
                    return athenaSecrets;
                case WarehouseTypes.BIGQUERY:
                    return {
                        type: WarehouseTypes.BIGQUERY,
                        authenticationType:
                            BigqueryAuthenticationType.PRIVATE_KEY,
                        keyfileContents: {
                            client_email: 'agent@example.com',
                        },
                    };
                default:
                    return assertUnreachable(
                        warehouseType,
                        'Unknown AI service account warehouse',
                    );
            }
        })(),
    });
    const warehouseCredentials = (): CreateWarehouseCredentials => {
        switch (warehouseType) {
            case WarehouseTypes.POSTGRES:
                return { ...postgresConnection };
            case WarehouseTypes.REDSHIFT:
                return { ...redshiftConnection };
            case WarehouseTypes.TRINO:
                return { ...trinoConnection };
            case WarehouseTypes.CLICKHOUSE:
                return { ...clickhouseConnection };
            case WarehouseTypes.ATHENA:
                return { ...athenaConnection };
            case WarehouseTypes.SNOWFLAKE:
                return {
                    ...snowflakeSecrets,
                    account: 'account.eu-west-1',
                    database: 'analytics',
                    schema: 'reporting',
                    accessUrl:
                        'https://account.eu-west-1.snowflakecomputing.com',
                };
            case WarehouseTypes.DATABRICKS:
                return {
                    type: WarehouseTypes.DATABRICKS,
                    serverHostName: 'adb-123.4.azuredatabricks.net',
                    httpPath: '/sql/warehouse',
                    database: 'analytics',
                };
            case WarehouseTypes.BIGQUERY:
                return {
                    type: WarehouseTypes.BIGQUERY,
                    project: 'warehouse-project',
                    dataset: 'analytics',
                    keyfileContents: { client_email: 'project@example.com' },
                    timeoutSeconds: 30,
                    priority: 'interactive',
                    retries: 3,
                    location: 'EU',
                    maximumBytesBilled: 0,
                    accessUrl: 'https://bigquery.googleapis.com',
                };
            default:
                return assertUnreachable(warehouseType, 'Unknown warehouse');
        }
    };
    const differentDestination = (
        credentials: CreateWarehouseCredentials,
    ): CreateWarehouseCredentials => {
        switch (credentials.type) {
            case WarehouseTypes.POSTGRES:
            case WarehouseTypes.REDSHIFT:
            case WarehouseTypes.TRINO:
            case WarehouseTypes.CLICKHOUSE:
                return { ...credentials, host: 'evil.example.com' };
            case WarehouseTypes.SNOWFLAKE:
                return { ...credentials, account: 'other-account' };
            case WarehouseTypes.DATABRICKS:
                return { ...credentials, serverHostName: 'evil.example.com' };
            case WarehouseTypes.ATHENA:
                return { ...credentials, region: 'us-east-2' };
            case WarehouseTypes.BIGQUERY:
                return {
                    ...credentials,
                    accessUrl: 'https://evil.example.com',
                };
            case WarehouseTypes.DUCKDB:
                throw new Error('Unsupported warehouse');
            default:
                return assertUnreachable(credentials, 'Unknown warehouse');
        }
    };
    const setup = () => {
        const projects = new Map<string, ProjectSummary>([
            [
                'preview',
                {
                    projectUuid: 'preview',
                    type: ProjectType.PREVIEW,
                    upstreamProjectUuid: 'parent',
                    organizationUuid: 'org',
                } as ProjectSummary,
            ],
            [
                'parent',
                {
                    projectUuid: 'parent',
                    type: ProjectType.DEFAULT,
                    organizationUuid: 'org',
                } as ProjectSummary,
            ],
        ]);
        const slots = new Map<string, ReturnType<typeof record>>([
            ['parent:null', record('parent')],
        ]);
        const childConnection = {
            warehouseConnectionUuid: 'extra',
            name: 'Analytics',
            warehouseType,
            isOriginal: false,
        } as WarehouseConnection;
        const parentConnection = {
            ...childConnection,
            warehouseConnectionUuid: 'parent-extra',
        };
        const credentials = new Map([
            ['preview:null', warehouseCredentials()],
            ['parent:null', warehouseCredentials()],
            ['preview:extra', warehouseCredentials()],
            ['parent:parent-extra', warehouseCredentials()],
        ]);
        const deps = {
            projectModel: {
                getWarehouseCredentialsForBinding: vi.fn(
                    async (uuid: string) => credentials.get(`${uuid}:null`)!,
                ),
                getSummary: vi.fn(async (uuid: string) => {
                    const project = projects.get(uuid);
                    if (!project) throw new NotFoundError('missing');
                    return project;
                }),
            },
            aiServiceAccountCredentialsModel: {
                getSecrets: vi.fn(
                    async (uuid: string, connection: string | null) =>
                        slots.get(`${uuid}:${connection}`) ?? null,
                ),
                getSlot: vi.fn(
                    async (uuid: string, connection: string | null) =>
                        slots.get(`${uuid}:${connection}`)?.slot ?? null,
                ),
            },
            warehouseConnectionModel: {
                getCredentials: vi.fn(
                    async (
                        { projectUuid }: { projectUuid: string },
                        uuid: string,
                    ) => credentials.get(`${projectUuid}:${uuid}`)!,
                ),
                getProject: vi.fn(async (projectUuid: string) => ({
                    projectUuid,
                })),
                get: vi.fn(async () => childConnection),
                list: vi.fn(async () => [parentConnection]),
            },
        };
        const resolver = new AiServiceAccountSlotResolver(
            deps as unknown as AiServiceAccountSlotDependencies,
        );
        const resolve = (connection: string | null = null) =>
            resolver.resolve({
                projectUuid: 'preview',
                connection,
                configuration: warehouseCredentials(),
            });
        return {
            resolve,
            resolver,
            projects,
            slots,
            deps,
            childConnection,
            parentConnection,
            credentials,
        };
    };

    it.each(['resolve', 'resolveMetadata'] as const)(
        '%s reads each project summary once',
        async (method) => {
            const f = setup();
            await f.resolver[method]({
                projectUuid: 'preview',
                connection: null,
                configuration: warehouseCredentials(),
            });
            expect(f.deps.projectModel.getSummary.mock.calls).toEqual([
                ['preview'],
                ['parent'],
            ]);
        },
    );
    it.each(['resolve', 'resolveMetadata'] as const)(
        '%s preserves missing-project behavior',
        async (method) => {
            const f = setup();
            f.projects.delete('preview');
            await expect(
                f.resolver[method]({
                    projectUuid: 'preview',
                    connection: null,
                    configuration: warehouseCredentials(),
                }),
            ).rejects.toBeInstanceOf(NotFoundError);
            f.slots.set('preview:null', record('preview'));
            await expect(
                f.resolver[method]({
                    projectUuid: 'preview',
                    connection: null,
                    configuration: warehouseCredentials(),
                }),
            ).resolves.toMatchObject({
                sourceProjectUuid: 'preview',
                inherited: false,
            });
        },
    );

    it('ignores a readable own slot in credential and metadata resolution', async () => {
        const f = setup();
        f.slots.set('preview:null', record('preview'));
        expect(await f.resolve()).toMatchObject({
            sourceProjectUuid: 'parent',
            inherited: true,
            slot: record('parent'),
        });
        expect(
            await f.resolver.resolveMetadata({
                projectUuid: 'preview',
                connection: null,
                configuration: warehouseCredentials(),
            }),
        ).toMatchObject({
            sourceProjectUuid: 'parent',
            slot: record('parent').slot,
        });
        expect(
            f.deps.aiServiceAccountCredentialsModel.getSecrets,
        ).toHaveBeenCalledExactlyOnceWith('parent', null, true);
        expect(
            f.deps.aiServiceAccountCredentialsModel.getSlot,
        ).toHaveBeenCalledExactlyOnceWith('parent', null);
    });
    it('ignores an unreadable own slot without reading or decrypting it', async () => {
        const f = setup();
        f.deps.aiServiceAccountCredentialsModel.getSecrets.mockImplementation(
            async (uuid) => {
                if (uuid === 'preview') throw new Error('invalid own key');
                return record('parent');
            },
        );
        expect(await f.resolve()).toMatchObject({
            sourceProjectUuid: 'parent',
            inherited: true,
        });
        expect(
            f.deps.aiServiceAccountCredentialsModel.getSecrets,
        ).toHaveBeenCalledExactlyOnceWith('parent', null, true);
    });
    it('returns missing when only the preview has an account', async () => {
        const f = setup();
        f.slots.set('preview:null', record('preview'));
        f.slots.delete('parent:null');
        expect(await f.resolve()).toBeNull();
        expect(
            await f.resolver.resolveMetadata({
                projectUuid: 'preview',
                connection: null,
                configuration: warehouseCredentials(),
            }),
        ).toBeNull();
        expect(
            f.deps.aiServiceAccountCredentialsModel.getSecrets,
        ).toHaveBeenCalledExactlyOnceWith('parent', null, true);
    });
    it.each(['default', 'no-upstream'] as const)(
        'keeps the own account for %s projects',
        async (scenario) => {
            const f = setup();
            f.slots.set('preview:null', record('preview'));
            if (scenario === 'default')
                f.projects.get('preview')!.type = ProjectType.DEFAULT;
            else f.projects.get('preview')!.upstreamProjectUuid = undefined;
            expect(await f.resolve()).toMatchObject({
                sourceProjectUuid: 'preview',
                inherited: false,
            });
            expect(
                f.deps.projectModel.getWarehouseCredentialsForBinding,
            ).not.toHaveBeenCalled();
            expect(
                f.deps.warehouseConnectionModel.getCredentials,
            ).not.toHaveBeenCalled();
            expect(
                f.deps.warehouseConnectionModel.getProject,
            ).not.toHaveBeenCalled();
        },
    );
    describe.each([
        'resolve',
        'resolveMetadata',
        'resolveParent',
        'resolveParentMetadata',
    ] as const)('%s destination binding', (method) => {
        it.each([null, 'extra'])(
            'rejects a changed destination for connection %s before reading any slot',
            async (connection) => {
                const f = setup();
                let error: unknown = null;
                try {
                    await f.resolver[method]({
                        projectUuid: 'preview',
                        connection,
                        configuration: differentDestination(
                            warehouseCredentials(),
                        ),
                    });
                } catch (caught) {
                    error = caught;
                }
                expect(
                    f.deps.projectModel.getWarehouseCredentialsForBinding,
                ).not.toHaveBeenCalledWith('preview', expect.anything());
                expect(
                    f.deps.warehouseConnectionModel.getCredentials,
                ).not.toHaveBeenCalledWith(
                    { projectUuid: 'preview' },
                    expect.anything(),
                );
                expect(error).toBeInstanceOf(
                    AiServiceAccountDestinationMismatchError,
                );
                expect(error).toMatchObject({
                    inheritedFromProjectUuid: 'parent',
                });
                expect(
                    f.deps.aiServiceAccountCredentialsModel.getSecrets,
                ).not.toHaveBeenCalled();
                expect(
                    f.deps.aiServiceAccountCredentialsModel.getSlot,
                ).not.toHaveBeenCalled();
            },
        );
        it.each([null, 'extra'])(
            'uses the supplied configuration instead of stored preview credentials for %s',
            async (connection) => {
                const f = setup();
                f.slots.set('parent:parent-extra', record('parent'));
                const configuration = warehouseCredentials();
                f.credentials.set(
                    `preview:${connection}`,
                    differentDestination(configuration),
                );
                const resolved = await f.resolver[method]({
                    projectUuid: 'preview',
                    connection,
                    configuration,
                });
                expect(resolved?.inherited).toBe(true);
                expect(resolved?.configuration).toBe(configuration);
                expect(
                    f.deps.projectModel.getWarehouseCredentialsForBinding,
                ).not.toHaveBeenCalledWith('preview', expect.anything());
                expect(
                    f.deps.warehouseConnectionModel.getCredentials,
                ).not.toHaveBeenCalledWith(
                    { projectUuid: 'preview' },
                    expect.anything(),
                );
            },
        );
        it.each(['parent'])(
            'fails closed when %s credentials cannot be loaded',
            async (projectUuid) => {
                const f = setup();
                f.deps.projectModel.getWarehouseCredentialsForBinding.mockImplementation(
                    async (uuid) => {
                        if (uuid === projectUuid)
                            throw new Error('invalid encrypted credentials');
                        return warehouseCredentials();
                    },
                );
                await expect(
                    f.resolver[method]({
                        projectUuid: 'preview',
                        connection: null,
                        configuration: warehouseCredentials(),
                    }),
                ).rejects.toMatchObject({
                    constructor: AiServiceAccountSlotResolutionError,
                    inheritedFromProjectUuid: 'parent',
                });
                expect(
                    f.deps.aiServiceAccountCredentialsModel.getSecrets,
                ).not.toHaveBeenCalled();
                expect(
                    f.deps.aiServiceAccountCredentialsModel.getSlot,
                ).not.toHaveBeenCalled();
            },
        );
        it('returns null when parent connection credentials are missing', async () => {
            const f = setup();
            f.deps.projectModel.getWarehouseCredentialsForBinding.mockImplementation(
                async (uuid) => {
                    if (uuid === 'parent')
                        throw new NotFoundError('missing connection');
                    return warehouseCredentials();
                },
            );
            await expect(
                f.resolver[method]({
                    projectUuid: 'preview',
                    connection: null,
                    configuration: warehouseCredentials(),
                }),
            ).resolves.toBeNull();
            expect(
                f.deps.aiServiceAccountCredentialsModel.getSecrets,
            ).not.toHaveBeenCalled();
            expect(
                f.deps.aiServiceAccountCredentialsModel.getSlot,
            ).not.toHaveBeenCalled();
        });
    });
    it('maps the original slot to the parent original', async () => {
        const f = setup();
        expect(await f.resolve()).toEqual({
            slot: record('parent'),
            configuration: warehouseCredentials(),
            sourceProjectUuid: 'parent',
            sourceConnection: null,
            inherited: true,
        });
        expect(
            f.deps.aiServiceAccountCredentialsModel.getSecrets,
        ).toHaveBeenLastCalledWith('parent', null, true);
    });
    it('normalizes an explicit original connection UUID', async () => {
        const f = setup();
        f.childConnection.isOriginal = true;
        expect(await f.resolve('original')).toMatchObject({
            sourceConnection: null,
            inherited: true,
        });
        expect(
            f.deps.aiServiceAccountCredentialsModel.getSecrets,
        ).toHaveBeenCalledExactlyOnceWith('parent', null, true);
    });
    it('maps extras by name and warehouse type', async () => {
        const f = setup();
        f.slots.set('parent:parent-extra', record('parent'));
        expect(await f.resolve('extra')).toMatchObject({
            sourceProjectUuid: 'parent',
            sourceConnection: 'parent-extra',
            inherited: true,
        });
        expect(
            f.deps.warehouseConnectionModel.getCredentials.mock.calls,
        ).toEqual([[{ projectUuid: 'parent' }, 'parent-extra']]);
        expect(
            f.deps.projectModel.getWarehouseCredentialsForBinding,
        ).not.toHaveBeenCalled();
    });
    it.each(['name', 'type', 'original'] as const)(
        'does not inherit from an extra with a mismatching %s',
        async (mismatch) => {
            const f = setup();
            f.slots.set('parent:parent-extra', record('parent'));
            f.slots.set('preview:extra', record('preview'));
            if (mismatch === 'name') f.parentConnection.name = 'Other';
            if (mismatch === 'type')
                f.parentConnection.warehouseType =
                    warehouseType === WarehouseTypes.POSTGRES
                        ? WarehouseTypes.BIGQUERY
                        : WarehouseTypes.POSTGRES;
            if (mismatch === 'original') f.parentConnection.isOriginal = true;
            expect(await f.resolve('extra')).toBeNull();
        },
    );
    it.each([
        'non-preview',
        'null-parent',
        'missing-parent',
        'other-org',
        'self-parent',
    ] as const)('rejects %s inheritance', async (scenario) => {
        const f = setup();
        const preview = f.projects.get('preview')!;
        if (scenario === 'non-preview') preview.type = ProjectType.DEFAULT;
        if (scenario === 'null-parent') preview.upstreamProjectUuid = undefined;
        if (scenario === 'missing-parent') f.projects.delete('parent');
        if (scenario === 'other-org')
            f.projects.get('parent')!.organizationUuid = 'other';
        if (scenario === 'self-parent') preview.upstreamProjectUuid = 'preview';
        expect(await f.resolve()).toBeNull();
    });
    it('does not follow the parent to a grandparent', async () => {
        const f = setup();
        f.projects.get('parent')!.type = ProjectType.PREVIEW;
        f.projects.get('parent')!.upstreamProjectUuid = 'grandparent';
        f.slots.delete('parent:null');
        f.slots.set('grandparent:null', record('grandparent'));
        expect(await f.resolve()).toBeNull();
        expect(f.deps.projectModel.getSummary).not.toHaveBeenCalledWith(
            'grandparent',
        );
    });
    it('reads replacements and removals on the next call', async () => {
        const f = setup();
        expect((await f.resolve())?.slot.slot.identityUuid).toBe(
            'generation-1',
        );
        f.slots.set('parent:null', record('parent', 'generation-2'));
        expect((await f.resolve())?.slot.slot.identityUuid).toBe(
            'generation-2',
        );
        f.slots.delete('parent:null');
        expect(await f.resolve()).toBeNull();
    });
    it('attributes an unreadable inherited slot to its parent', async () => {
        const f = setup();
        f.deps.aiServiceAccountCredentialsModel.getSecrets.mockRejectedValueOnce(
            new Error('broken'),
        );
        await expect(f.resolve()).rejects.toEqual(
            new AiServiceAccountSlotResolutionError('parent'),
        );
    });
    it('reports the parent even when an own slot exists', async () => {
        const f = setup();
        f.slots.set('preview:null', record('preview'));
        expect(
            await f.resolver.resolveParent({
                projectUuid: 'preview',
                connection: null,
                configuration: warehouseCredentials(),
            }),
        ).toMatchObject({
            sourceProjectUuid: 'parent',
            slot: record('parent'),
        });
    });
    it.each([false, true])(
        'uses Databricks preview slot precedence with a local slot=%s',
        async (local) => {
            const f = setup();
            const databricks = {
                type: WarehouseTypes.DATABRICKS,
                authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                oauthClientId: 'id',
                oauthClientSecret: 'secret',
            } as const;
            f.slots.set('parent:null', {
                ...record('parent'),
                secrets: databricks,
            });
            if (local)
                f.slots.set('preview:null', {
                    ...record('preview'),
                    secrets: databricks,
                });
            expect(await f.resolve()).toMatchObject({
                sourceProjectUuid: 'parent',
                inherited: true,
                slot: { secrets: databricks },
            });
        },
    );
});
