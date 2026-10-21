import { DbtProjectType, type Explore } from '@lightdash/common';
import { validExplore } from './ProjectService/ProjectService.mock';
import { resolveCliPreviewDeploy } from './resolveCliPreviewDeploy';

const explore = (
    name: string,
    packageName: string,
    sourceUuid?: string,
): Explore => ({
    ...validExplore,
    name,
    baseTable: name,
    tables: {
        [name]: {
            ...validExplore.tables.a,
            name,
            dbtPackageName: packageName,
            ...(sourceUuid ? { dbtSourceUuid: sourceUuid } : {}),
        },
    },
});

const setup = () => {
    const source = (projectDbtSourceUuid: string) => ({
        projectDbtSourceUuid,
        name: 'Replica models',
        dbtConnection: { type: DbtProjectType.NONE },
        warehouseConnectionUuid: null,
    });
    const models = {
        projectModel: {
            getDbtSourceIdentity: vi
                .fn()
                .mockImplementation(async (project: string) => ({
                    dbtSourceUuid:
                        project === 'preview' ? 'primary' : 'parent-primary',
                    dbtSourceName: 'Core models',
                })),
            getAllExploresFromCache: vi.fn().mockResolvedValue({}),
        },
        projectDbtSourcesModel: {
            getSourcesWithBindings: vi
                .fn()
                .mockImplementation(async (project: string) => [
                    source(project === 'preview' ? 'extra' : 'parent-extra'),
                ]),
        },
        dbtSourceRefCatalogModel: {
            getProjectNames: vi
                .fn()
                .mockImplementation(async (project: string) =>
                    project === 'preview'
                        ? []
                        : [
                              {
                                  dbt_source_uuid: 'parent-primary',
                                  project_name: 'analytics',
                              },
                              {
                                  dbt_source_uuid: 'parent-extra',
                                  project_name: 'finance',
                              },
                          ],
                ),
        },
    };
    const args = {
        projectUuid: 'preview',
        upstreamProjectUuid: 'parent',
        sourceUuid: null as string | null,
        explores: [
            explore('orders', 'analytics'),
            explore('payments', 'finance'),
        ],
    };
    return { models, args };
};

const resolvePackages = async (
    ...args: Parameters<typeof resolveCliPreviewDeploy>
) => (await resolveCliPreviewDeploy(...args)).sourcesByPackage;

const rejected = async (reason: string, result: Promise<unknown>) => {
    const error = await result.catch((value: unknown) => value);
    expect(error).toMatchObject({ statusCode: 409 });
    expect((error as Error).message).toContain(
        'This deploy was not saved and nothing in the project changed.',
    );
    expect((error as Error).message).toContain(reason);
    expect((error as Error).message).toContain(
        'Sources in this project: Core models, Replica models.',
    );
    expect((error as Error).message).not.toMatch(/--source|set-source/);
};

test.each([null, 'extra'])(
    'maps a fresh mixed preview from copied parent sources (explicit %s)',
    async (sourceUuid) => {
        const { models, args } = setup();
        await expect(
            resolvePackages(models, { ...args, sourceUuid }),
        ).resolves.toEqual(
            new Map([
                ['analytics', 'primary'],
                ['finance', 'extra'],
            ]),
        );
    },
);

test('accepts a single-package preview', async () => {
    const { models, args } = setup();
    args.explores = [explore('orders', 'analytics')];
    const result = await resolvePackages(models, args);
    expect(result.get('analytics')).toBe('primary');
});

test('uses parent cached stamps when no ref catalog is available', async () => {
    const { models, args } = setup();
    models.dbtSourceRefCatalogModel.getProjectNames.mockResolvedValue([]);
    models.projectModel.getAllExploresFromCache.mockImplementation(
        async (project: string) =>
            project === 'preview'
                ? {}
                : {
                      orders: explore('orders', 'analytics', 'parent-primary'),
                      payments: explore('payments', 'finance', 'parent-extra'),
                  },
    );
    expect(await resolvePackages(models, args)).toEqual(
        new Map([
            ['analytics', 'primary'],
            ['finance', 'extra'],
        ]),
    );
});

test('uses the preview cache without a parent', async () => {
    const { models, args } = setup();
    models.projectModel.getAllExploresFromCache.mockResolvedValue({
        orders: explore('orders', 'analytics', 'primary'),
        payments: explore('payments', 'finance', 'extra'),
    });
    expect(
        await resolvePackages(models, {
            ...args,
            upstreamProjectUuid: undefined,
        }),
    ).toEqual(
        new Map([
            ['analytics', 'primary'],
            ['finance', 'extra'],
        ]),
    );
});

test.each([null, 'extra'])(
    'rejects an unmappable package (explicit %s)',
    async (sourceUuid) => {
        const { models, args } = setup();
        args.explores.push(explore('unknown_model', 'unregistered'));
        await rejected(
            'no source in this project provides the dbt project unregistered',
            resolvePackages(models, { ...args, sourceUuid }),
        );
    },
);

test('rejects ambiguous package ownership', async () => {
    const { models, args } = setup();
    models.dbtSourceRefCatalogModel.getProjectNames.mockResolvedValue([
        { dbt_source_uuid: 'parent-primary', project_name: 'analytics' },
        { dbt_source_uuid: 'parent-extra', project_name: 'analytics' },
    ]);
    await rejected(
        'several sources (Core models, Replica models) provide analytics',
        resolvePackages(models, args),
    );
});

test('does not infer dbt project names from source labels', async () => {
    const { models, args } = setup();
    models.dbtSourceRefCatalogModel.getProjectNames.mockResolvedValue([]);
    args.explores = [explore('orders', 'Replica models')];
    await rejected(
        'no source in this project provides the dbt project Replica models',
        resolvePackages(models, args),
    );
});

test('rejects a cached name that belongs to a different source', async () => {
    const { models, args } = setup();
    models.projectModel.getAllExploresFromCache.mockResolvedValue({
        orders: explore('orders', 'analytics', 'primary'),
    });
    args.explores = [explore('orders', 'finance')];
    await rejected(
        'orders (source Core models)',
        resolvePackages(models, args),
    );
});

test('rejects an explicit source that contradicts a single-package preview', async () => {
    const { models, args } = setup();
    args.explores = [explore('orders', 'analytics')];
    await rejected(
        'the deploy named source Replica models, but the uploaded explores belong to source Core models',
        resolvePackages(models, { ...args, sourceUuid: 'extra' }),
    );
});

test('rejects an explicit source from another project', async () => {
    const { models, args } = setup();
    await expect(
        resolvePackages(models, { ...args, sourceUuid: 'unrelated' }),
    ).rejects.toMatchObject({ statusCode: 400 });
});

test('rejects two uploaded packages that claim the same explore name', async () => {
    const { models, args } = setup();
    args.explores = [
        explore('orders', 'analytics'),
        explore('orders', 'finance'),
    ];
    await rejected(
        'orders (source Core models)',
        resolvePackages(models, args),
    );
});

test('resolves unstamped preview rows from main through the parent package map', async () => {
    const { models, args } = setup();
    models.projectModel.getAllExploresFromCache.mockResolvedValue({
        orders: explore('orders', 'analytics'),
        payments: explore('payments', 'finance'),
    });
    expect(await resolvePackages(models, args)).toEqual(
        new Map([
            ['analytics', 'primary'],
            ['finance', 'extra'],
        ]),
    );
});

test('remaps source stamps retained from the parent by main', async () => {
    const { models, args } = setup();
    models.projectModel.getAllExploresFromCache.mockResolvedValue({
        orders: explore('orders', 'analytics', 'parent-primary'),
        payments: explore('payments', 'finance', 'parent-extra'),
    });
    const result = await resolveCliPreviewDeploy(models, args);
    expect(result.sourcesByPackage).toEqual(
        new Map([
            ['analytics', 'primary'],
            ['finance', 'extra'],
        ]),
    );
    expect(result.sourceAliases.get('parent-primary')).toBe('primary');
    expect(result.sourceAliases.get('parent-extra')).toBe('extra');
});

test('does not reuse parent ownership when a copied source connection changed', async () => {
    const { models, args } = setup();
    models.projectDbtSourcesModel.getSourcesWithBindings.mockImplementation(
        async (project: string) => [
            {
                projectDbtSourceUuid:
                    project === 'preview' ? 'extra' : 'parent-extra',
                name: 'Replica models',
                dbtConnection: {
                    type: DbtProjectType.NONE,
                    selector: project === 'preview' ? 'changed' : 'original',
                },
                warehouseConnectionUuid: null,
            },
        ],
    );
    await rejected(
        'no source in this project provides the dbt project finance',
        resolvePackages(models, args),
    );
});

test('rejects an unmappable joined package instead of stamping it as the base source', async () => {
    const { models, args } = setup();
    args.explores[0].tables.joined = explore(
        'joined',
        'unregistered',
    ).tables.joined;
    await rejected(
        'no source in this project provides the dbt project unregistered',
        resolvePackages(models, args),
    );
});
