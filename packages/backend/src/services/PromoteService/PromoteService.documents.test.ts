import {
    ChartType,
    ConflictError,
    ForbiddenError,
    getUserAbilityBuilder,
    NotFoundError,
    OrganizationMemberRole,
    PromotionAction,
    type Document,
    type DocumentChartContent,
    type DocumentContent,
    type RegisteredAccount,
    type SpaceSummaryBase,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { PromoteService } from './PromoteService';

const organizationUuid = 'organization';
const userUuid = 'promoter';
const previewProjectUuid = 'preview-project';
const upstreamProjectUuid = 'upstream-project';
const previewSpaceUuid = 'preview-space';
const upstreamSpaceUuid = 'upstream-space';
const sourceAppUuid = 'preview-chart-type';
const upstreamAppUuid = 'upstream-chart-type';

const markdown = (text: string): DocumentContent => ({
    markdown: text,
    charts: {},
});

const withChart = (chart: DocumentChartContent): DocumentContent => ({
    markdown: '<document-chart id="c1">',
    charts: { c1: chart },
});

const customChart = (
    dataAppVizUuid: string,
    version: number,
): DocumentChartContent => ({
    source: 'semantic',
    chart: {
        name: 'Statuses',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 100,
            tableCalculations: [],
        },
        chartConfig: {
            type: ChartType.DATA_APP_VIZ,
            config: {
                dataAppVizUuid,
                dataAppVizVersion: version,
                fieldMapping: { status: 'orders_status' },
            },
        },
    },
});

const makeDocument = (
    documentUuid: string,
    projectUuid: string,
    spaceUuid: string,
    content: DocumentContent = markdown('# Findings'),
): Document => ({
    pinnedListUuid: null,
    createdBy: null,
    owner: null,
    documentUuid,
    organizationUuid,
    projectUuid,
    spaceUuid,
    name: 'Review',
    slug: 'review',
    description: 'Quarterly review',
    createdByUserUuid: userUuid,
    ownerUserUuid: null,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
    version: {
        versionUuid: `${documentUuid}-version`,
        versionNumber: 1,
        schemaVersion: 2,
        content,
        createdByUserUuid: userUuid,
        createdAt: new Date('2026-09-01'),
    },
});

const source = makeDocument(
    'preview-document',
    previewProjectUuid,
    previewSpaceUuid,
);
const upstream = makeDocument(
    'upstream-document',
    upstreamProjectUuid,
    upstreamSpaceUuid,
);

const space = (overrides: Partial<SpaceSummaryBase> = {}): SpaceSummaryBase =>
    ({
        organizationUuid,
        projectUuid: previewProjectUuid,
        uuid: previewSpaceUuid,
        name: 'Reports',
        slug: 'reports',
        path: 'reports',
        parentSpaceUuid: null,
        inheritParentPermissions: true,
        ...overrides,
    }) as SpaceSummaryBase;

const makeAccount = (role: OrganizationMemberRole): RegisteredAccount =>
    ({
        authentication: { type: 'session' },
        organization: { organizationUuid, name: 'Org' },
        user: {
            id: userUuid,
            userUuid,
            userId: 1,
            role,
            ability: getUserAbilityBuilder({
                user: { userUuid, organizationUuid, role },
                projectProfiles: [],
                permissionsConfig: {
                    pat: { enabled: false, allowedOrgRoles: [] },
                },
            }).builder.build(),
        },
        isAnonymousUser: () => false,
        isServiceAccount: () => false,
    }) as unknown as RegisteredAccount;

const developer = makeAccount(OrganizationMemberRole.DEVELOPER);

const setup = ({
    sourceDocument = source,
    upstreamDocument = upstream as Document | null,
    upstreamSpaces = [space({ uuid: upstreamSpaceUuid })],
    linkedChartType = false,
}: {
    sourceDocument?: Document;
    upstreamDocument?: Document | null;
    upstreamSpaces?: SpaceSummaryBase[];
    linkedChartType?: boolean;
} = {}) => {
    const documentService = {
        get: vi.fn(async (_account: unknown, projectUuid: string) =>
            projectUuid === previewProjectUuid
                ? sourceDocument
                : upstreamDocument,
        ),
        getBySlug: vi.fn(async () => {
            if (!upstreamDocument) {
                throw new NotFoundError('Document not found');
            }
            return upstreamDocument;
        }),
        create: vi.fn(async () => upstream),
        updateContent: vi.fn(async () => upstream),
        updateMetadata: vi.fn(async () => upstream),
        moveToSpace: vi.fn(async () => undefined),
    };
    const appModel = {
        findApp: vi.fn(async (appUuid: string) =>
            appUuid === sourceAppUuid
                ? {
                      app_id: sourceAppUuid,
                      upstream_app_uuid: linkedChartType
                          ? upstreamAppUuid
                          : null,
                  }
                : { app_id: upstreamAppUuid },
        ),
        getLatestRenderableDataAppVizVersion: vi.fn(async () => ({
            version: 4,
        })),
    };
    const appGenerateService = {
        getDataAppPromoteChanges: vi.fn(
            async (_user: unknown, _project: string, uuids: string[]) =>
                uuids.map((uuid) => ({
                    uuid,
                    name: 'Status pills',
                    action: 'create',
                })),
        ),
        promoteAppsForDashboard: vi.fn(
            async (_user: unknown, _project: string, appUuids: string[]) =>
                appUuids.map((appUuid) => ({
                    sourceAppUuid: appUuid,
                    upstreamAppUuid,
                    upstreamAppVersion: 1,
                })),
        ),
    };
    const service = new PromoteService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {
            getSummary: vi.fn(async (projectUuid: string) => ({
                organizationUuid,
                projectUuid,
                upstreamProjectUuid:
                    projectUuid === previewProjectUuid
                        ? upstreamProjectUuid
                        : undefined,
            })),
        },
        spaceModel: {
            getSpaceSummary: vi.fn(async () => space()),
            getSpaceAncestors: vi.fn(async () => []),
            find: vi.fn(async () => upstreamSpaces),
        },
        savedChartModel: {},
        savedSqlModel: {},
        dashboardModel: {},
        spacePermissionService: {
            resolveAccess: vi.fn(async () => ({
                organizationUuid,
                projectUuid: upstreamProjectUuid,
                inheritsFromOrgOrProject: true,
                access: [],
            })),
        },
        warehouseConnectionModel: {},
        appModel,
        getDocumentService: () => documentService,
        getAppGenerateService: () => appGenerateService,
    } as unknown as ConstructorParameters<typeof PromoteService>[0]);
    const upsertSpaces = vi
        .spyOn(service, 'upsertSpaces')
        .mockImplementation(async (_user, _projectUuid, changes) => ({
            ...changes,
            spaces: changes.spaces.map((change) => ({
                ...change,
                data: { ...change.data, uuid: upstreamSpaceUuid },
            })),
        }));
    return { service, documentService, appGenerateService, upsertSpaces };
};

describe('Document promotion', () => {
    it('previews a new Document and its missing space without writing', async () => {
        const { service, documentService, upsertSpaces } = setup({
            upstreamDocument: null,
            upstreamSpaces: [],
        });

        const diff = await service.getPromoteDocumentDiff(
            developer,
            previewProjectUuid,
            source.documentUuid,
        );

        expect(diff.spaces).toEqual([
            expect.objectContaining({ action: PromotionAction.CREATE }),
        ]);
        expect(diff.documents).toEqual([
            {
                action: PromotionAction.CREATE,
                data: { uuid: source.documentUuid, name: 'Review' },
            },
        ]);
        expect(upsertSpaces).not.toHaveBeenCalled();
        expect(documentService.create).not.toHaveBeenCalled();
    });

    it('reports no changes when the upstream Document already matches', async () => {
        const { service } = setup();

        const diff = await service.getPromoteDocumentDiff(
            developer,
            previewProjectUuid,
            source.documentUuid,
        );

        expect(diff.documents?.[0].action).toBe(PromotionAction.NO_CHANGES);
    });

    it('creates the Document upstream with its slug in the mirrored space', async () => {
        const { service, documentService } = setup({ upstreamDocument: null });

        await service.promoteDocument(
            developer,
            previewProjectUuid,
            source.documentUuid,
        );

        expect(documentService.create).toHaveBeenCalledWith(
            developer,
            upstreamProjectUuid,
            expect.objectContaining({
                slug: 'review',
                spaceUuid: upstreamSpaceUuid,
                content: source.version.content,
            }),
            { source: 'promotion' },
        );
    });

    it('writes nothing to a Document that already matches', async () => {
        const { service, documentService } = setup();

        await service.promoteDocument(
            developer,
            previewProjectUuid,
            source.documentUuid,
        );

        expect(documentService.create).not.toHaveBeenCalled();
        expect(documentService.updateContent).not.toHaveBeenCalled();
        expect(documentService.updateMetadata).not.toHaveBeenCalled();
        expect(documentService.moveToSpace).not.toHaveBeenCalled();
    });

    it('updates only the upstream content that changed', async () => {
        const edited = {
            ...source,
            version: {
                ...source.version,
                content: markdown('# Findings\n\nMore'),
            },
        };
        const { service, documentService } = setup({ sourceDocument: edited });

        await service.promoteDocument(
            developer,
            previewProjectUuid,
            source.documentUuid,
        );

        expect(documentService.updateContent).toHaveBeenCalledWith(
            developer,
            upstreamProjectUuid,
            upstream.documentUuid,
            {
                baseVersionUuid: upstream.version.versionUuid,
                content: edited.version.content,
            },
            { change: { source: 'promotion' } },
        );
        expect(documentService.updateMetadata).not.toHaveBeenCalled();
        expect(documentService.moveToSpace).not.toHaveBeenCalled();
    });

    it('refuses to create upstream spaces for members who cannot create spaces', async () => {
        const { service, documentService, upsertSpaces } = setup({
            upstreamDocument: null,
            upstreamSpaces: [],
        });

        await expect(
            service.promoteDocument(
                makeAccount(OrganizationMemberRole.VIEWER),
                previewProjectUuid,
                source.documentUuid,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(upsertSpaces).not.toHaveBeenCalled();
        expect(documentService.create).not.toHaveBeenCalled();
    });

    describe('custom chart types', () => {
        const withCustomChart = makeDocument(
            'preview-document',
            previewProjectUuid,
            previewSpaceUuid,
            withChart(customChart(sourceAppUuid, 2)),
        );

        it('promotes a chart type with no upstream link and binds the chart to it', async () => {
            const { service, documentService, appGenerateService } = setup({
                sourceDocument: withCustomChart,
                upstreamDocument: null,
            });

            await service.promoteDocument(
                developer,
                previewProjectUuid,
                source.documentUuid,
            );

            expect(
                appGenerateService.promoteAppsForDashboard,
            ).toHaveBeenCalledWith(expect.anything(), previewProjectUuid, [
                sourceAppUuid,
            ]);
            expect(documentService.create).toHaveBeenCalledWith(
                developer,
                upstreamProjectUuid,
                expect.objectContaining({
                    content: withChart(customChart(upstreamAppUuid, 1)),
                }),
                { source: 'promotion' },
            );
        });

        it('reuses the linked upstream chart type instead of promoting a new version', async () => {
            const { service, documentService, appGenerateService } = setup({
                sourceDocument: withCustomChart,
                upstreamDocument: null,
                linkedChartType: true,
            });

            await service.promoteDocument(
                developer,
                previewProjectUuid,
                source.documentUuid,
            );

            expect(
                appGenerateService.promoteAppsForDashboard,
            ).not.toHaveBeenCalled();
            expect(documentService.create).toHaveBeenCalledWith(
                developer,
                upstreamProjectUuid,
                expect.objectContaining({
                    content: withChart(customChart(upstreamAppUuid, 4)),
                }),
                { source: 'promotion' },
            );
        });

        it('fails instead of leaving a chart bound to a deleted chart type', async () => {
            const { service, documentService, appGenerateService } = setup({
                sourceDocument: withCustomChart,
                upstreamDocument: null,
            });
            appGenerateService.promoteAppsForDashboard.mockResolvedValue([]);

            await expect(
                service.promoteDocument(
                    developer,
                    previewProjectUuid,
                    source.documentUuid,
                ),
            ).rejects.toThrow(ConflictError);
            expect(documentService.create).not.toHaveBeenCalled();
        });
    });
});
