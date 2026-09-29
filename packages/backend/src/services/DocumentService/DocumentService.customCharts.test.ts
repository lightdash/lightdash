import {
    ChartType,
    getUserAbilityBuilder,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    SpaceMemberRole,
    type DataAppVizSchema,
    type Document,
    type DocumentCell,
    type DocumentContent,
    type RegisteredAccount,
} from '@lightdash/common';
import { DocumentService } from './DocumentService';

const userUuid = 'document-author';
const organizationUuid = 'document-organization';
const projectUuid = 'document-project';
const spaceUuid = 'document-space';
const documentUuid = 'document-uuid';
const baseVersionUuid = 'document-version';
const vizUuid = 'viz-uuid';
const vizSlug = 'grouped-bars';

const vizSchema = {
    fields: [
        { name: 'category', type: 'dimension', required: true },
        { name: 'value', type: 'metric', required: true },
    ],
    configOptions: [{ name: 'stacked', type: 'boolean', label: 'Stacked' }],
    colorPalette: null,
} as unknown as DataAppVizSchema;

const customChart = (config: Record<string, unknown>): DocumentCell =>
    ({
        type: 'chart',
        content: {
            source: 'semantic',
            chart: {
                name: 'Orders',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: ['orders_count'],
                    filters: {},
                    sorts: [],
                    limit: 100,
                    tableCalculations: [],
                },
                chartConfig: { type: ChartType.DATA_APP_VIZ, config },
            },
        },
    }) as unknown as DocumentCell;

const binding = {
    fieldMapping: { category: 'orders_status', value: 'orders_count' },
    optionValues: { stacked: true },
};
const stored = customChart({
    ...binding,
    dataAppVizUuid: vizUuid,
    dataAppVizVersion: 3,
});
const markdown: DocumentCell = {
    type: 'markdown',
    content: { markdown: 'Findings' },
};

const makeDocument = (content: DocumentContent): Document => ({
    pinnedListUuid: null,
    createdBy: null,
    documentUuid,
    organizationUuid,
    projectUuid,
    spaceUuid,
    name: 'Review',
    slug: 'review',
    description: '',
    createdByUserUuid: userUuid,
    createdAt: new Date('2026-09-15'),
    updatedAt: new Date('2026-09-15'),
    version: {
        versionUuid: baseVersionUuid,
        versionNumber: 1,
        schemaVersion: 1,
        createdByUserUuid: userUuid,
        createdAt: new Date('2026-09-15'),
        content,
    },
});

const account = {
    authentication: { type: 'session' },
    organization: { organizationUuid },
    user: {
        id: userUuid,
        userUuid,
        role: OrganizationMemberRole.EDITOR,
        ability: getUserAbilityBuilder({
            user: {
                userUuid,
                organizationUuid,
                role: OrganizationMemberRole.EDITOR,
            },
            projectProfiles: [],
            permissionsConfig: {
                pat: { enabled: false, allowedOrgRoles: [] },
            },
        }).builder.build(),
    },
    isAnonymousUser: () => false,
    isServiceAccount: () => false,
} as unknown as RegisteredAccount;

const setup = (existing: DocumentContent = { cells: [markdown] }) => {
    const documentModel = {
        get: vi.fn().mockResolvedValue(makeDocument(existing)),
        getBySlug: vi.fn().mockResolvedValue(makeDocument(existing)),
        create: vi
            .fn()
            .mockImplementation(async ({ content }) => makeDocument(content)),
        updateContent: vi
            .fn()
            .mockImplementation(async (_project, _document, { content }) =>
                makeDocument(content),
            ),
    };
    const appModel = {
        findAppsBySlugs: vi
            .fn()
            .mockImplementation(async (_project, slugs: string[]) =>
                slugs.includes(vizSlug)
                    ? [{ app_id: vizUuid, slug: vizSlug }]
                    : [],
            ),
        findAppsByUuids: vi
            .fn()
            .mockImplementation(async (_project, uuids: string[]) =>
                uuids.includes(vizUuid)
                    ? [{ app_id: vizUuid, slug: vizSlug }]
                    : [],
            ),
        getVersion: vi
            .fn()
            .mockImplementation(async (_viz, version: number) =>
                version === 3
                    ? { version: 3, status: 'ready', viz_schema: vizSchema }
                    : { version, status: 'error', viz_schema: null },
            ),
        getLatestRenderableDataAppVizVersion: vi.fn().mockResolvedValue({
            version: 3,
            status: 'ready',
            viz_schema: vizSchema,
        }),
    };
    const context = {
        projectUuid,
        organizationUuid,
        inheritsFromOrgOrProject: true,
        access: [{ userUuid, role: SpaceMemberRole.EDITOR }],
    };
    const projectService = {
        compileQuery: vi.fn().mockResolvedValue({
            compilationErrors: [],
            missingParameterReferences: new Set<string>(),
        }),
    };
    const service = new DocumentService({
        appModel,
        documentModel,
        projectModel: {
            getSummary: vi
                .fn()
                .mockResolvedValue({ projectUuid, organizationUuid }),
        },
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        },
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue(context),
        },
        spaceModel: {
            find: vi.fn().mockResolvedValue([{ path: 'reports' }]),
        },
        projectService,
    } as unknown as ConstructorParameters<typeof DocumentService>[0]);
    return { service, documentModel, appModel, projectService };
};

const create = (service: DocumentService, cells: DocumentCell[]) =>
    service.create(account, projectUuid, {
        name: 'Review',
        description: '',
        spaceUuid,
        schemaVersion: 1,
        content: { cells },
    });

describe('DocumentService custom chart types', () => {
    test('stores a slug binding by this project’s viz uuid and pinned version', async () => {
        const { service, documentModel } = setup();
        const created = await create(service, [
            customChart({ ...binding, dataAppVizSlug: vizSlug }),
        ]);
        expect(documentModel.create.mock.calls[0][0].content).toEqual({
            cells: [stored],
        });
        // Reads carry the portable slug next to the uuid.
        expect(created.version.content.cells[0]).toEqual(
            customChart({
                ...binding,
                dataAppVizUuid: vizUuid,
                dataAppVizVersion: 3,
                dataAppVizSlug: vizSlug,
            }),
        );
    });

    test('keeps an explicitly pinned renderable version', async () => {
        const { service, documentModel, appModel } = setup();
        await create(service, [
            customChart({
                ...binding,
                dataAppVizSlug: vizSlug,
                dataAppVizVersion: 3,
            }),
        ]);
        expect(appModel.getVersion).toHaveBeenCalledWith(vizUuid, 3);
        expect(documentModel.create.mock.calls[0][0].content).toEqual({
            cells: [stored],
        });
    });

    test('rejects an unknown slug', async () => {
        const { service, documentModel } = setup();
        await expect(
            create(service, [
                customChart({ ...binding, dataAppVizSlug: 'missing' }),
            ]),
        ).rejects.toThrow(
            new NotFoundError(
                'Custom chart type "missing" was not found in this project. Install the chart type in this project, or pick a different chart type.',
            ),
        );
        expect(documentModel.create).not.toHaveBeenCalled();
    });

    test('rejects a chart type uuid from another project', async () => {
        const { service } = setup();
        await expect(
            create(service, [
                customChart({ ...binding, dataAppVizUuid: 'foreign-viz' }),
            ]),
        ).rejects.toThrow(ParameterError);
    });

    test('rejects a version that is not renderable', async () => {
        const { service } = setup();
        await expect(
            create(service, [
                customChart({
                    ...binding,
                    dataAppVizSlug: vizSlug,
                    dataAppVizVersion: 2,
                }),
            ]),
        ).rejects.toThrow(`"${vizSlug}" version 2 is not renderable`);
    });

    test.each([
        [
            'an undeclared slot',
            { ...binding.fieldMapping, size: 'orders_count' },
            'Unknown field slots in fieldMapping: size',
        ],
        [
            'an unbound required slot',
            { category: 'orders_status' },
            'Required field slots not bound in fieldMapping: value',
        ],
        [
            'a field outside the query',
            { category: 'orders_status', value: 'orders_total' },
            'value → orders_total',
        ],
        [
            'a dimension in a metric slot',
            { category: 'orders_status', value: 'orders_status' },
            'Slot "value" (metric) only accepts metrics',
        ],
    ])('rejects a mapping with %s', async (_case, fieldMapping, message) => {
        const { service } = setup();
        await expect(
            create(service, [
                customChart({
                    fieldMapping,
                    dataAppVizSlug: vizSlug,
                }),
            ]),
        ).rejects.toThrow(message);
    });

    test('rejects an option value that does not match its declaration', async () => {
        const { service } = setup();
        await expect(
            create(service, [
                customChart({
                    ...binding,
                    optionValues: { stacked: 'yes' },
                    dataAppVizSlug: vizSlug,
                }),
            ]),
        ).rejects.toThrow('Option "stacked" (boolean) expects true or false');
    });

    test('narrative edits keep a stored chart even after its chart type is gone', async () => {
        const { service, documentModel, appModel, projectService } = setup({
            cells: [markdown, stored],
        });
        appModel.findAppsByUuids.mockResolvedValue([]);
        appModel.getVersion.mockResolvedValue(null);
        await service.updateContent(account, projectUuid, documentUuid, {
            baseVersionUuid,
            content: {
                cells: [
                    { type: 'markdown', content: { markdown: 'Updated' } },
                    stored,
                ],
            },
        });
        expect(documentModel.updateContent.mock.calls[0][2].content).toEqual({
            cells: [
                { type: 'markdown', content: { markdown: 'Updated' } },
                stored,
            ],
        });
        expect(projectService.compileQuery).not.toHaveBeenCalled();
        expect(appModel.getVersion).not.toHaveBeenCalled();
    });

    test('a read-back chart with its slug round-trips without revalidation', async () => {
        const { service, documentModel, projectService } = setup({
            cells: [stored],
        });
        const current = await service.get(account, projectUuid, documentUuid);
        await service.updateContent(account, projectUuid, documentUuid, {
            baseVersionUuid,
            content: current.version.content,
        });
        expect(documentModel.updateContent.mock.calls[0][2].content).toEqual({
            cells: [stored],
        });
        expect(projectService.compileQuery).not.toHaveBeenCalled();
    });

    test('exports the portable slug without the project-specific uuid', async () => {
        const { service } = setup({ cells: [stored] });
        const asCode = await service.getAsCode(
            account,
            projectUuid,
            documentUuid,
        );
        expect(asCode.content.cells[0]).toEqual(
            customChart({
                ...binding,
                dataAppVizVersion: 3,
                dataAppVizSlug: vizSlug,
            }),
        );
    });

    test('keeps the uuid of a chart type deleted since', async () => {
        const { service, appModel } = setup({ cells: [stored] });
        appModel.findAppsByUuids.mockResolvedValue([]);
        const asCode = await service.getAsCode(
            account,
            projectUuid,
            documentUuid,
        );
        expect(asCode.content.cells[0]).toEqual(stored);
    });
});
