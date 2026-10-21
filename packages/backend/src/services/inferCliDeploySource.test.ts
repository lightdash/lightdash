import { ConflictError, WarehouseTypes, type Explore } from '@lightdash/common';
import { inferCliDeploySource } from './inferCliDeploySource';
import { validExplore } from './ProjectService/ProjectService.mock';

const explore = (
    name: string,
    sourceUuid?: string,
    packageName = 'analytics',
): Explore => ({
    ...validExplore,
    name,
    baseTable: name,
    tables: {
        [name]: {
            ...validExplore.tables.a,
            name,
            dbtPackageName: packageName,
            database: 'warehouse',
            ...(sourceUuid ? { dbtSourceUuid: sourceUuid } : {}),
        },
    },
});

const setup = () => {
    const models = {
        projectModel: {
            getDbtSourceIdentity: vi
                .fn()
                .mockResolvedValue({ dbtSourceUuid: 'primary' }),
            getAllExploresFromCache: vi
                .fn()
                .mockResolvedValue({ orders: explore('orders', 'primary') }),
            getWarehouseCredentialsForBinding: vi.fn().mockResolvedValue({
                type: WarehouseTypes.POSTGRES,
                dbname: 'warehouse',
            }),
        },
        projectDbtSourcesModel: {
            getSourcesWithBindings: vi.fn().mockResolvedValue([
                {
                    projectDbtSourceUuid: 'extra',
                    warehouseConnectionUuid: null,
                    warehouseLocation: { database: 'other', schema: null },
                },
            ]),
        },
        dbtSourceRefCatalogModel: {
            getProjectNames: vi.fn().mockResolvedValue([]),
        },
        warehouseConnectionModel: {
            getProject: vi.fn(),
            getCredentials: vi.fn(),
        },
    };
    const args = {
        projectUuid: 'project',
        explores: [explore('orders')],
        dbtModelNames: undefined as string[] | undefined,
        cliDeploy: { sourceUuid: null, target: null },
    };
    return { models, args };
};

test('reports the package match and accepts matching qualified model names', async () => {
    const { models, args } = setup();
    args.dbtModelNames = ['orders', 'analytics__orders'];
    await expect(inferCliDeploySource(models, args)).resolves.toMatchObject({
        sourceUuid: 'primary',
        method: 'package_match',
        droppedExploreCount: 0,
    });
});

test.each([8, 9])(
    'requires at least nine of ten names for overlap (%s matches)',
    async (matches) => {
        const { models, args } = setup();
        models.projectModel.getAllExploresFromCache.mockResolvedValue(
            Object.fromEntries([
                ...Array.from({ length: matches }, (_, i) => [
                    `model_${i}`,
                    explore(`model_${i}`, 'primary'),
                ]),
                ['extra_model', explore('extra_model', 'extra')],
            ]),
        );
        models.projectDbtSourcesModel.getSourcesWithBindings.mockResolvedValue([
            {
                projectDbtSourceUuid: 'extra',
                warehouseConnectionUuid: null,
                warehouseLocation: { database: 'warehouse', schema: null },
            },
        ]);
        args.explores = Array.from({ length: 10 }, (_, i) =>
            explore(`model_${i}`),
        );
        if (matches === 9) {
            await expect(
                inferCliDeploySource(models, args),
            ).resolves.toMatchObject({
                sourceUuid: 'primary',
                method: 'overlap_tiebreak',
            });
        } else {
            await expect(
                inferCliDeploySource(models, args),
            ).rejects.toBeInstanceOf(ConflictError);
        }
    },
);

test('uses the bound warehouse credentials to break a package tie', async () => {
    const { models, args } = setup();
    models.projectModel.getAllExploresFromCache.mockResolvedValue({
        primary: explore('old', 'primary'),
        extra: explore('extra', 'extra'),
    });
    models.projectDbtSourcesModel.getSourcesWithBindings.mockResolvedValue([
        {
            projectDbtSourceUuid: 'extra',
            warehouseConnectionUuid: 'connection',
            warehouseLocation: { database: null, schema: null },
        },
    ]);
    models.warehouseConnectionModel.getCredentials.mockResolvedValue({
        type: WarehouseTypes.POSTGRES,
        dbname: 'extra_warehouse',
    });
    args.explores = [explore('new_model')];
    args.explores[0].tables.new_model.database = 'extra_warehouse';
    await expect(inferCliDeploySource(models, args)).resolves.toMatchObject({
        sourceUuid: 'extra',
        method: 'database_tiebreak',
    });
});

test('does not use joined table packages as source evidence', async () => {
    const { models, args } = setup();
    args.explores[0].tables.joined = explore(
        'joined',
        undefined,
        'finance',
    ).tables.joined;
    await expect(inferCliDeploySource(models, args)).resolves.toMatchObject({
        sourceUuid: 'primary',
        method: 'package_match',
    });
});

test('does not overwrite another source through an unmapped installed package', async () => {
    const { models, args } = setup();
    models.projectModel.getAllExploresFromCache.mockResolvedValue({
        primary: explore('orders', 'primary'),
        extra: explore('shared_name', 'extra', 'finance'),
    });
    args.explores.push(explore('shared_name', undefined, 'dbt_utils'));
    await expect(inferCliDeploySource(models, args)).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('--source'),
    });
});

test('drops a tableless upstream error by its cached name', async () => {
    const { models, args } = setup();
    models.projectModel.getAllExploresFromCache.mockResolvedValue({
        primary: explore('orders', 'primary'),
        extra: explore('upstream', 'extra', 'finance'),
    });
    const result = await inferCliDeploySource(models, {
        ...args,
        explores: [
            ...args.explores,
            { name: 'upstream', label: 'upstream', errors: [] },
        ],
    });
    expect(result.explores).toEqual(args.explores);
    expect(result.droppedExploreCount).toBe(1);
});

test('does not trust source identities supplied by the upload', async () => {
    const { models, args } = setup();
    args.explores = [explore('orders', 'extra')];
    await expect(inferCliDeploySource(models, args)).resolves.toMatchObject({
        sourceUuid: 'primary',
    });
});

test('includes catalog project names even when only an installed package is cached', async () => {
    const { models, args } = setup();
    models.projectModel.getAllExploresFromCache.mockResolvedValue({
        dependency: explore('spine', 'primary', 'dbt_utils'),
    });
    models.dbtSourceRefCatalogModel.getProjectNames.mockResolvedValue([
        { dbt_source_uuid: 'primary', project_name: 'analytics' },
    ]);
    await expect(inferCliDeploySource(models, args)).resolves.toMatchObject({
        sourceUuid: 'primary',
    });
});
