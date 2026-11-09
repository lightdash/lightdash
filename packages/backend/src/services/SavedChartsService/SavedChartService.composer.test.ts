import { Ability } from '@casl/ability';
import {
    ChartType,
    ComposerChartNotSupportedError,
    PossibleAbilities,
    QuerySourceType,
    type AnyType,
    type ComposerSavedChartDAO,
    type SavedChartVariant,
    type SessionUser,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { SavedChartService } from './SavedChartService';

const composerChart: ComposerSavedChartDAO = {
    uuid: 'composer-uuid',
    projectUuid: 'project-uuid',
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
    dashboardUuid: 'dashboard-uuid',
    dashboardName: 'Revenue',
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

const editor = {
    userUuid: 'editor-uuid',
    organizationUuid: composerChart.organizationUuid,
    ability: new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'SavedChart' },
        { action: 'manage', subject: 'DeletedContent' },
        { action: 'view', subject: 'Project' },
    ]),
    abilityRules: [],
} as unknown as SessionUser;

const spaceContext = { inheritsFromOrgOrProject: true, access: [] };

const buildService = (softDeleteEnabled = false) => {
    const savedChartModel = {
        get: vi.fn(async () => {
            throw new ComposerChartNotSupportedError(
                composerChart.uuid,
                composerChart.name,
            );
        }),
        getVariant: vi.fn(async () => composerVariant),
        getSummary: vi.fn(async () => composerChart),
        findComposerCharts: vi.fn(async () => [
            {
                uuid: composerChart.uuid,
                name: composerChart.name,
                slug: composerChart.slug,
            },
        ]),
        update: vi.fn(async () => composerVariant),
        softDelete: vi.fn(async () => composerVariant),
        permanentDelete: vi.fn(async () => composerVariant),
        restore: vi.fn(async () => undefined),
    };
    const schedulerService = {
        softDeleteByChartUuid: vi.fn(),
        restoreByChartUuid: vi.fn(),
    };
    const upsertOpenDraft = vi.fn(async (args: AnyType) => ({
        uuid: 'draft-uuid',
        draft: args.draft,
    }));
    const service = new SavedChartService({
        analytics: analyticsMock,
        lightdashConfig: {
            ...lightdashConfigMock,
            softDelete: {
                ...lightdashConfigMock.softDelete,
                enabled: softDeleteEnabled,
            },
        },
        projectModel: {
            getExploreFromCache: vi
                .fn()
                .mockRejectedValue(new Error('No cached explore in unit test')),
        },
        savedChartModel,
        schedulerService,
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue(spaceContext),
        },
        contentVerificationModel: {
            getByContent: vi.fn().mockResolvedValue(null),
            unverify: vi.fn(),
        },
        organizationModel: {},
        contentAsCodeProjectSettingsModel: {
            get: vi.fn().mockResolvedValue({ syncEnabled: false }),
        },
        contentAsCodeSnapshotModel: { get: vi.fn() },
        contentDraftModel: { findOpenDraft: vi.fn(), upsertOpenDraft },
    } as AnyType);
    return { service, savedChartModel, schedulerService, upsertOpenDraft };
};

describe('SavedChartService with a composer chart', () => {
    it('refuses to update it by name before writing anything', async () => {
        const { service, savedChartModel } = buildService();

        await expect(
            service.update(editor, composerChart.uuid, { name: 'Renamed' }),
        ).rejects.toBeInstanceOf(ComposerChartNotSupportedError);
        expect(savedChartModel.update).not.toHaveBeenCalled();
    });

    it('refuses to draft it by name before storing anything', async () => {
        const { service, upsertOpenDraft } = buildService();

        await expect(
            service['storeDraft'](
                editor,
                composerChart as AnyType,
                { name: 'Drafted' },
                null,
                spaceContext,
                { kind: 'published', versionUuid: 'version-uuid' } as AnyType,
            ),
        ).rejects.toBeInstanceOf(ComposerChartNotSupportedError);
        expect(upsertOpenDraft).not.toHaveBeenCalled();
    });

    it('deletes it like any other chart', async () => {
        const { service, savedChartModel } = buildService();

        await service.delete(editor, composerChart.uuid);

        expect(savedChartModel.permanentDelete).toHaveBeenCalledWith(
            composerChart.uuid,
        );
    });

    it('soft-deletes and restores it like any other chart', async () => {
        const { service, savedChartModel } = buildService(true);

        await service.delete(editor, composerChart.uuid);
        await service.restore(editor, composerChart.uuid);

        expect(savedChartModel.softDelete).toHaveBeenCalledWith(
            composerChart.uuid,
            editor.userUuid,
        );
        expect(savedChartModel.restore).toHaveBeenCalledWith(
            composerChart.uuid,
        );
    });
});
