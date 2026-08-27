import { Ability } from '@casl/ability';
import {
    ChartType,
    PossibleAbilities,
    type AnyType,
    type SessionUser,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { fromSession } from '../../auth/account';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { SavedChartService } from './SavedChartService';

const chart = {
    uuid: 'chart-uuid',
    projectUuid: 'project-uuid',
    organizationUuid: 'org-uuid',
    slug: 'monthly-revenue',
    name: 'Monthly revenue',
    description: 'Published description',
    tableName: 'orders',
    metricQuery: {
        metrics: ['orders_revenue'],
        dimensions: [],
        filters: { dimensions: {}, metrics: {}, tableCalculations: {} },
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    chartConfig: { type: ChartType.CARTESIAN, config: {} },
    tableConfig: { columnOrder: [] },
    merge: null,
    updatedAt: new Date(),
    updatedByUser: undefined,
    spaceUuid: 'space-uuid',
    spaceName: 'Finance',
    dashboardUuid: null,
    dashboardName: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    colorPalette: [],
    colorPaletteUuid: null,
    resolvedColorPalette: { colors: [] },
    verification: null,
};

const editor = {
    userUuid: 'editor-uuid',
    ability: new Ability<PossibleAbilities>([
        { action: ['view', 'update', 'delete'], subject: 'SavedChart' },
    ]),
    abilityRules: [],
} as unknown as SessionUser;

const reviewer = {
    userUuid: 'reviewer-uuid',
    ability: new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'ContentAsCode' },
        { action: 'delete', subject: 'SavedChart' },
    ]),
} as unknown as SessionUser;

const spaceContext = { inheritsFromOrgOrProject: true, access: [] };

const buildService = (
    overrides: {
        settings?: object;
        snapshot?: object;
        draft?: object;
        softDeleteEnabled?: boolean;
    } = {},
) => {
    const settingsGet = vi
        .fn()
        .mockResolvedValue(
            'settings' in overrides
                ? overrides.settings
                : { syncEnabled: true },
        );
    const snapshotGet = vi
        .fn()
        .mockResolvedValue(
            'snapshot' in overrides
                ? overrides.snapshot
                : { snapshotHash: 'hash' },
        );
    const upsertOpenDraft = vi.fn(async (args: AnyType) => ({
        uuid: 'draft-uuid',
        draft: args.draft,
    }));
    const findOpenDraft = vi.fn().mockResolvedValue(overrides.draft);
    const contentDraftModel = {
        upsertOpenDraft,
        findOpenDraft,
        findLatestDismissedDraft: vi.fn().mockResolvedValue(undefined),
        countOpenForContent: vi.fn().mockResolvedValue(0),
    };
    const savedChartModel = {
        get: vi.fn().mockResolvedValue(chart),
        getSummary: vi.fn().mockResolvedValue(chart),
        createVersion: vi.fn(),
        update: vi.fn(),
        permanentDelete: vi.fn().mockResolvedValue(chart),
        softDelete: vi.fn().mockResolvedValue(chart),
    };
    const service = new SavedChartService({
        analytics: analyticsMock,
        lightdashConfig: {
            ...lightdashConfigMock,
            softDelete: {
                ...lightdashConfigMock.softDelete,
                enabled: overrides.softDeleteEnabled ?? false,
            },
        },
        projectModel: {
            get: vi.fn().mockResolvedValue({
                projectUuid: chart.projectUuid,
                organizationUuid: chart.organizationUuid,
            }),
            getExploreFromCache: vi
                .fn()
                .mockRejectedValue(new Error('No cached explore in unit test')),
        },
        savedChartModel,
        spaceModel: {},
        analyticsModel: {},
        pinnedListModel: {},
        schedulerModel: {},
        schedulerService: {
            softDeleteByChartUuid: vi.fn(),
        },
        schedulerClient: {},
        slackClient: {},
        dashboardModel: {},
        catalogModel: {},
        permissionsService: {},
        googleDriveClient: {},
        userService: {},
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue(spaceContext),
        },
        contentVerificationModel: {
            getByContent: vi.fn().mockResolvedValue(undefined),
        },
        organizationModel: {},
        contentAsCodeProjectSettingsModel: { get: settingsGet },
        contentAsCodeSnapshotModel: { get: snapshotGet },
        contentDraftModel,
    } as AnyType);
    return {
        service,
        settingsGet,
        snapshotGet,
        upsertOpenDraft,
        findOpenDraft,
        contentDraftModel,
        savedChartModel,
    };
};

describe('SavedChartService chart drafts', () => {
    it('stores Git-backed editor changes without mutating published content', async () => {
        const { service, upsertOpenDraft } = buildService();

        const result = await service['maybeStoreDraft'](
            editor,
            chart as AnyType,
            { name: 'Drafted revenue' },
            null,
            spaceContext,
        );

        expect(upsertOpenDraft).toHaveBeenCalledWith(
            expect.objectContaining({
                contentType: 'chart',
                contentUuid: chart.uuid,
                authorUserUuid: editor.userUuid,
            }),
        );
        expect(result).toMatchObject({
            name: 'Drafted revenue',
            hasUnpublishedChanges: true,
        });
        expect(chart.name).toBe('Monthly revenue');
    });

    it('turns a Git-backed chart version save into a draft', async () => {
        const { service, savedChartModel, upsertOpenDraft } = buildService();

        const result = await service.createVersion(
            fromSession(editor as AnyType, 'session-cookie'),
            chart.uuid,
            {
                tableName: chart.tableName,
                metricQuery: chart.metricQuery,
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: { isStacked: true },
                },
                tableConfig: chart.tableConfig,
                merge: null,
            } as AnyType,
        );

        expect(result).toMatchObject({ hasUnpublishedChanges: true });
        expect(upsertOpenDraft).toHaveBeenCalledWith(
            expect.objectContaining({ contentType: 'chart' }),
        );
        expect(savedChartModel.createVersion).not.toHaveBeenCalled();
    });

    it('turns a Git-backed chart rename into the same draft workflow', async () => {
        const { service, savedChartModel } = buildService();

        const result = await service.update(editor, chart.uuid, {
            name: 'Drafted chart name',
        });

        expect(result).toMatchObject({
            name: 'Drafted chart name',
            hasUnpublishedChanges: true,
        });
        expect(savedChartModel.update).not.toHaveBeenCalled();
    });

    it('publishes UI-only charts through the existing path', async () => {
        const { service, upsertOpenDraft } = buildService({
            snapshot: undefined,
        });

        const result = await service['maybeStoreDraft'](
            editor,
            chart as AnyType,
            { name: 'Published rename' },
            null,
            spaceContext,
        );

        expect(result).toBeUndefined();
        expect(upsertOpenDraft).not.toHaveBeenCalled();
    });

    it('lets content-as-code reviewers publish directly', async () => {
        const { service, upsertOpenDraft } = buildService();

        const result = await service['maybeStoreDraft'](
            reviewer,
            chart as AnyType,
            { name: 'Reviewed rename' },
            null,
            spaceContext,
        );

        expect(result).toBeUndefined();
        expect(upsertOpenDraft).not.toHaveBeenCalled();
    });

    it('blocks an editor from deleting a Git-backed chart', async () => {
        const { service, savedChartModel } = buildService();

        await expect(service.delete(editor, chart.uuid)).rejects.toThrow(
            'This chart is managed by Content as Code',
        );
        expect(savedChartModel.permanentDelete).not.toHaveBeenCalled();
        expect(savedChartModel.softDelete).not.toHaveBeenCalled();
    });

    it('deletes a UI-only chart normally', async () => {
        const { service, savedChartModel } = buildService({
            snapshot: undefined,
        });

        await expect(
            service.delete(editor, chart.uuid),
        ).resolves.toBeUndefined();
        expect(savedChartModel.permanentDelete).toHaveBeenCalledWith(
            chart.uuid,
        );
    });

    it('soft-deletes a UI-only chart normally', async () => {
        const { service, savedChartModel } = buildService({
            snapshot: undefined,
            softDeleteEnabled: true,
        });

        await expect(
            service.delete(editor, chart.uuid),
        ).resolves.toBeUndefined();
        expect(savedChartModel.softDelete).toHaveBeenCalledWith(
            chart.uuid,
            editor.userUuid,
        );
        expect(savedChartModel.permanentDelete).not.toHaveBeenCalled();
    });

    it('deletes normally when Content as Code sync is disabled', async () => {
        const { service, savedChartModel, snapshotGet } = buildService({
            settings: { syncEnabled: false },
        });

        await expect(
            service.delete(editor, chart.uuid),
        ).resolves.toBeUndefined();
        expect(snapshotGet).not.toHaveBeenCalled();
        expect(savedChartModel.permanentDelete).toHaveBeenCalledWith(
            chart.uuid,
        );
    });

    it('lets a content-as-code manager delete a Git-backed chart', async () => {
        const { service, savedChartModel } = buildService();

        await expect(
            service.delete(reviewer, chart.uuid),
        ).resolves.toBeUndefined();
        expect(savedChartModel.permanentDelete).toHaveBeenCalledWith(
            chart.uuid,
        );
    });

    it.each(['softDelete', 'permanentDelete'] as const)(
        'does not let an internal %s call bypass the Git-backed policy',
        async (method) => {
            const { service, savedChartModel } = buildService();

            await expect(
                service[method](editor, chart.uuid, {
                    bypassPermissions: true,
                }),
            ).rejects.toThrow('This chart is managed by Content as Code');
            expect(savedChartModel.permanentDelete).not.toHaveBeenCalled();
            expect(savedChartModel.softDelete).not.toHaveBeenCalled();
        },
    );

    it("overlays only the caller's draft", async () => {
        const { service, findOpenDraft } = buildService({
            draft: {
                uuid: 'draft-uuid',
                draft: { name: 'Author draft' },
            },
        });

        const result = await service['applyOpenDraftOverlay'](editor, {
            ...chart,
            ...spaceContext,
        } as AnyType);

        expect(result).toMatchObject({
            name: 'Author draft',
            hasUnpublishedChanges: true,
        });
        expect(findOpenDraft).toHaveBeenCalledWith(
            chart.projectUuid,
            'chart',
            chart.uuid,
            editor.userUuid,
        );
    });

    it('serves published content when a stored chart draft is invalid', async () => {
        const { service } = buildService({
            draft: {
                uuid: 'draft-uuid',
                draft: { metricQuery: 'invalid' },
            },
        });

        const result = await service['applyOpenDraftOverlay'](editor, {
            ...chart,
            ...spaceContext,
        } as AnyType);

        expect(result).toMatchObject({
            name: 'Monthly revenue',
            draftOverlayError: {
                code: 'invalid_chart_draft',
                draftUuid: 'draft-uuid',
            },
        });
    });
});
