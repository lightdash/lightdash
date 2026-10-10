import {
    assertUnreachable,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    NotFoundError,
    ProjectType,
    WarehouseTypes,
    type AiServiceAccountSlot,
    type ProjectSummary,
    type WarehouseConnection,
} from '@lightdash/common';
import { type AiServiceAccountSecrets } from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import {
    athenaSecrets,
    clickhouseSecrets,
    redshiftSecrets,
    snowflakeSecrets,
    trinoSecrets,
} from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel.mock';
import {
    AiServiceAccountSlotResolutionError,
    AiServiceAccountSlotResolver,
    type AiServiceAccountSlotDependencies,
} from './resolveAiServiceAccountSlot';

describe.each([
    WarehouseTypes.CLICKHOUSE,
    WarehouseTypes.REDSHIFT,
    WarehouseTypes.TRINO,
    WarehouseTypes.BIGQUERY,
    WarehouseTypes.SNOWFLAKE,
    WarehouseTypes.DATABRICKS,
    WarehouseTypes.ATHENA,
])('%s slot inheritance', (warehouseType) => {
    const record = (projectUuid: string, identityUuid = 'generation-1') => ({
        slot: {
            uuid: `${projectUuid}-slot`,
            projectUuid,
            identityUuid,
        } as AiServiceAccountSlot,
        secrets: ((): AiServiceAccountSecrets => {
            switch (warehouseType) {
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
                case WarehouseTypes.DUCKDB:
                case WarehouseTypes.POSTGRES:
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
        const deps = {
            projectModel: {
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
            resolver.resolve({ projectUuid: 'preview', connection });
        return {
            resolve,
            resolver,
            projects,
            slots,
            deps,
            childConnection,
            parentConnection,
        };
    };

    it('uses an own slot before the parent', async () => {
        const f = setup();
        f.slots.set('preview:null', record('preview'));
        expect(await f.resolve()).toMatchObject({
            sourceProjectUuid: 'preview',
            inherited: false,
            slot: record('preview'),
        });
        expect(f.deps.projectModel.getSummary).not.toHaveBeenCalled();
    });
    it('never falls back from an unreadable own slot', async () => {
        const f = setup();
        f.deps.aiServiceAccountCredentialsModel.getSecrets.mockRejectedValueOnce(
            new Error('invalid key'),
        );
        await expect(f.resolve()).rejects.toMatchObject({
            inheritedFromProjectUuid: null,
        });
        expect(
            f.deps.aiServiceAccountCredentialsModel.getSecrets,
        ).toHaveBeenCalledTimes(1);
        expect(f.deps.projectModel.getSummary).not.toHaveBeenCalled();
    });
    it('maps the original slot to the parent original', async () => {
        const f = setup();
        expect(await f.resolve()).toEqual({
            slot: record('parent'),
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
        ).toHaveBeenNthCalledWith(1, 'preview', null, true);
    });
    it('maps extras by name and warehouse type', async () => {
        const f = setup();
        f.slots.set('parent:parent-extra', record('parent'));
        expect(await f.resolve('extra')).toMatchObject({
            sourceProjectUuid: 'parent',
            sourceConnection: 'parent-extra',
            inherited: true,
        });
    });
    it.each(['name', 'type', 'original'] as const)(
        'does not inherit from an extra with a mismatching %s',
        async (mismatch) => {
            const f = setup();
            f.slots.set('parent:parent-extra', record('parent'));
            if (mismatch === 'name') f.parentConnection.name = 'Other';
            if (mismatch === 'type')
                f.parentConnection.warehouseType = WarehouseTypes.POSTGRES;
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
        f.deps.aiServiceAccountCredentialsModel.getSecrets
            .mockResolvedValueOnce(null)
            .mockRejectedValueOnce(new Error('broken'));
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
                sourceProjectUuid: local ? 'preview' : 'parent',
                inherited: !local,
                slot: { secrets: databricks },
            });
        },
    );
});
