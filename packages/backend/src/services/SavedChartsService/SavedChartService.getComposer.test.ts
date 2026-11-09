import { Ability } from '@casl/ability';
import {
    ChartType,
    ComposerChartNotSupportedError,
    NotComposerChartError,
    NotFoundError,
    QuerySourceType,
    type AnyType,
    type ComposerSavedChartDAO,
    type PossibleAbilities,
    type SavedChartVariant,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { fromSession } from '../../auth/account';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { SavedChartService } from './SavedChartService';

const composerChart: ComposerSavedChartDAO = {
    uuid: 'composer-uuid',
    projectUuid: '2f5b5c6e-6b61-4d9c-9d1e-3a1f0d8c7b21',
    organizationUuid: 'org-uuid',
    slug: 'revenue-by-status',
    name: 'Revenue by status',
    description: undefined,
    pipeline: {
        schemaVersion: 1,
        nodes: [
            {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'orders',
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_total_order_amount'],
            },
        ],
        terminalNodeId: 'orders',
    },
    chartConfig: { type: ChartType.TABLE },
    updatedAt: new Date(),
    updatedByUser: undefined,
    spaceUuid: 'space-uuid',
    spaceName: 'Reports',
    dashboardUuid: null,
    dashboardName: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    colorPalette: [],
    colorPaletteUuid: null,
    resolvedColorPalette: { colors: [] } as AnyType,
    verification: null,
};
const composerVariant: SavedChartVariant = {
    queryType: 'composer',
    chart: composerChart,
};

const viewer = {
    userUuid: 'viewer-uuid',
    userId: 1,
    organizationUuid: 'org-uuid',
    ability: new Ability<PossibleAbilities>([
        { action: 'view', subject: 'SavedChart' },
        { action: 'view', subject: 'Project' },
    ]),
    abilityRules: [],
} as unknown as SessionUser;
const account = fromSession(viewer);

const spaceContext = { inheritsFromOrgOrProject: true, access: [] };

const buildService = (variant: SavedChartVariant = composerVariant) => {
    const savedChartModel = {
        get: vi.fn(async () => {
            throw new ComposerChartNotSupportedError(composerChart.uuid);
        }),
        getVariant: vi.fn(async () => variant),
    };
    const projectModel = {
        getExploreFromCache: vi
            .fn()
            .mockRejectedValue(
                new NotFoundError('No cached explore in unit test'),
            ),
    };
    const findOpenDraft = vi.fn(async () => {
        throw new Error('a composer chart has no draft overlay');
    });
    const service = new SavedChartService({
        analytics: analyticsMock,
        lightdashConfig: lightdashConfigMock,
        projectModel,
        savedChartModel,
        spaceModel: {
            getSpaceSummary: vi.fn(async () => ({
                uuid: composerChart.spaceUuid,
                isPrivate: false,
            })),
        },
        analyticsModel: { addChartViewEvent: vi.fn(async () => undefined) },
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue(spaceContext),
        },
        contentAsCodeProjectSettingsModel: {
            get: vi.fn().mockResolvedValue({ syncEnabled: true }),
        },
        contentAsCodeSnapshotModel: {
            get: vi.fn().mockResolvedValue({
                snapshot: {},
                snapshotHash: 'snapshot-hash',
            }),
        },
        contentDraftModel: { findOpenDraft },
    } as AnyType);
    return { service };
};

describe('SavedChartService reads a composer chart', () => {
    test('getVariant returns the composer chart with the caller access and no explore load', async () => {
        const { service } = buildService();

        const variant = await service.getVariant(composerChart.slug, account, {
            projectUuid: composerChart.projectUuid,
        });

        expect(variant).toEqual({
            queryType: 'composer',
            chart: { ...composerChart, ...spaceContext },
        });
    });

    test('get refuses it by name so classic callers never see a pipeline', async () => {
        const { service } = buildService();

        await expect(
            service.get(composerChart.uuid, account),
        ).rejects.toBeInstanceOf(ComposerChartNotSupportedError);
    });

    test('getComposer returns it with the caller access', async () => {
        const { service } = buildService();

        await expect(
            service.getComposer(composerChart.uuid, account),
        ).resolves.toEqual({ ...composerChart, ...spaceContext });
    });

    test('getComposer refuses a classic chart by name', async () => {
        const { service } = buildService({
            queryType: 'semantic',
            chart: { ...composerChart, tableName: 'orders' } as AnyType,
        });

        await expect(
            service.getComposer(composerChart.uuid, account),
        ).rejects.toBeInstanceOf(NotComposerChartError);
    });

    test('getForViewer returns it without a draft overlay', async () => {
        const { service } = buildService();

        const variant = await service.getForViewer(
            viewer,
            composerChart.uuid,
            account,
        );

        expect(variant.queryType).toBe('composer');
        expect(variant.chart).toMatchObject({
            pipeline: composerChart.pipeline,
        });
    });
});
