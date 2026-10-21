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
            getDbtSourceIdentity: vi.fn().mockResolvedValue({
                dbtSourceUuid: 'primary',
                dbtSourceName: 'Core models',
            }),
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
                    name: 'Replica models',
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
                name: 'Replica models',
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
            name: 'Replica models',
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

const expectedMessage = (
    reason: string,
) => `This deploy was not saved and nothing in the project changed.
The project has several dbt sources and Lightdash could not tell which one these explores belong to: ${reason}.

To fix it, name the source for this deploy:
  lightdash deploy --source <name>
or store it once for this project:
  lightdash config set-source <name>

Sources in this project: Core models, Replica models.
If the sources show no dbt project name yet, refresh the project in Lightdash, then deploy again.`;

test.each([
    {
        kind: 'missing-project-name',
        reason: 'the uploaded explores carry no dbt project name; update the Lightdash CLI',
    },
    {
        kind: 'unmapped',
        reason: 'no source in this project provides the dbt project unknown',
    },
    {
        kind: 'mixed',
        reason: 'the upload contains models from several sources (analytics, finance)',
    },
    {
        kind: 'contradictory-model-list',
        reason: 'the explores and the model list disagree; run the deploy again',
    },
    {
        kind: 'unknown-cache',
        reason: 'the saved explores do not identify their dbt source; refresh the project in Lightdash',
    },
    {
        kind: 'empty',
        reason: 'the upload contains no explores; compile the dbt project and deploy again',
    },
    {
        kind: 'errors-only',
        reason: 'none of the uploaded explores compiled successfully; fix the compile errors and deploy again',
    },
    {
        kind: 'name-collision',
        reason: 'an uploaded explore name already belongs to another source',
    },
])(
    'explains $kind and lists the names accepted by --source',
    async ({ kind, reason }) => {
        const { models, args } = setup();
        if (kind === 'missing-project-name')
            delete args.explores[0].tables.orders.dbtPackageName;
        if (kind === 'unmapped')
            args.explores[0].tables.orders.dbtPackageName = 'unknown';
        if (kind === 'mixed' || kind === 'name-collision') {
            models.projectModel.getAllExploresFromCache.mockResolvedValue({
                orders: explore('orders', 'primary'),
                extra: explore('payments', 'extra', 'finance'),
            });
            args.explores.push(
                explore(
                    'payments',
                    undefined,
                    kind === 'mixed' ? 'finance' : 'dbt_utils',
                ),
            );
        }
        if (kind === 'contradictory-model-list')
            args.dbtModelNames = ['other__orders'];
        if (kind === 'unknown-cache')
            models.projectModel.getAllExploresFromCache.mockResolvedValue({
                legacy: explore('legacy'),
            });
        if (kind === 'empty') args.explores = [];
        const upload =
            kind === 'errors-only'
                ? {
                      ...args,
                      explores: [
                          { name: 'orders', label: 'Orders', errors: [] },
                      ],
                  }
                : args;
        await expect(
            inferCliDeploySource(models, upload),
        ).rejects.toMatchObject({
            statusCode: 409,
            message: expectedMessage(reason),
        });
    },
);

test.each([null, 'warehouse', 'unmatched_database'])(
    'names both duplicate sources and explains the target database %s',
    async (database) => {
        const { models, args } = setup();
        models.projectModel.getAllExploresFromCache.mockResolvedValue({
            primary: explore('old_primary', 'primary'),
            extra: explore('old_extra', 'extra'),
        });
        models.projectDbtSourcesModel.getSourcesWithBindings.mockResolvedValue([
            {
                projectDbtSourceUuid: 'extra',
                name: 'Replica models',
                warehouseConnectionUuid: null,
                warehouseLocation: { database: 'warehouse', schema: null },
            },
        ]);
        const upload = explore('new_model');
        upload.tables.new_model.database = database ?? 'warehouse';
        const reason = `sources Core models and Replica models both provide analytics, and ${database ? `the dbt target database ${database} does not pick one` : 'the deploy did not send a dbt target database'}`;
        await expect(
            inferCliDeploySource(models, {
                ...args,
                explores: [upload],
                cliDeploy: {
                    sourceUuid: null,
                    target: database ? { database } : null,
                },
            }),
        ).rejects.toMatchObject({
            statusCode: 409,
            message: expectedMessage(reason),
        });
    },
);

test.each([false, true])(
    'explains contradictory databases with target %s',
    async (withTarget) => {
        const { models, args } = setup();
        models.projectModel.getAllExploresFromCache.mockResolvedValue({
            primary: explore('old_primary', 'primary'),
            extra: explore('old_extra', 'extra'),
        });
        const upload = explore('new_model');
        upload.tables.new_model.database = 'other_database';
        const reason = withTarget
            ? 'the explores and the dbt target name different databases; run the deploy again'
            : 'the uploaded explores name several databases; run the deploy again';
        await expect(
            inferCliDeploySource(models, {
                ...args,
                explores: withTarget
                    ? [upload]
                    : [upload, explore('another_model')],
                cliDeploy: {
                    sourceUuid: null,
                    target: withTarget ? { database: 'warehouse' } : null,
                },
            }),
        ).rejects.toMatchObject({
            statusCode: 409,
            message: expectedMessage(reason),
        });
    },
);
