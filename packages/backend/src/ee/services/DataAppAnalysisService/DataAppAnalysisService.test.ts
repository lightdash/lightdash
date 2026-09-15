import {
    DimensionType,
    FeatureFlags,
    FieldType,
    ForbiddenError,
    MetricType,
    ParameterError,
    QueryExecutionContext,
    type ItemsMap,
} from '@lightdash/common';
import { buildAccount } from '../../../auth/account/account.mock';
import { assertCanViewApp } from '../AppGenerateService/appAuthz';
import {
    DataAppAnalysisService,
    DataAppAnalysisUnavailableError,
} from './DataAppAnalysisService';

vi.mock('../AppGenerateService/appAuthz', () => ({
    assertCanViewApp: vi.fn().mockResolvedValue({ directOnly: false }),
}));

const fields = {
    orders_status: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'status',
        label: 'Status',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.status',
        hidden: false,
    },
    orders_total: {
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name: 'total',
        label: 'Total',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.total',
        hidden: false,
    },
} as unknown as ItemsMap;

const rows = [
    { orders_status: 'completed', orders_total: 1594 },
    { orders_status: 'returned', orders_total: 12 },
];

const detection = {
    headline: 'Returns doubled in Q3',
    summary: 'Returned orders rose to 12 in Q3.',
    anomalies: [
        {
            severity: 'high' as const,
            text: 'Returned orders are 12 in Q3',
            queryUuid: 'q1',
            fieldId: 'orders_total',
            dimensionValues: { orders_status: 'returned' },
            expected: null,
            actual: '12',
        },
        {
            severity: 'medium' as const,
            text: 'Made up row',
            queryUuid: 'q1',
            fieldId: 'orders_total',
            dimensionValues: { orders_status: 'shipped' },
            expected: null,
            actual: '3',
        },
    ],
    limitations: ['No prior period in the data'],
    dataAsOf: 'Q3 2026',
};

function buildService(
    overrides: {
        orgSettingEnabled?: boolean;
        copilotEnabled?: boolean;
        dataAppsEnabled?: boolean;
        analysisEnabled?: boolean;
        queryContext?: QueryExecutionContext;
    } = {},
) {
    const dataAppAnalysisModel = {
        create: vi.fn(async (data: unknown) => ({
            data_app_analysis_uuid: 'analysis-1',
            created_at: new Date('2026-09-15T10:00:00Z'),
            ...(data as object),
        })),
    };
    const asyncQueryService = {
        getAsyncQueryHistory: vi.fn().mockResolvedValue({
            context: overrides.queryContext ?? QueryExecutionContext.EXPLORE,
        }),
        getRawAsyncQueryResults: vi.fn().mockResolvedValue({
            rows,
            fields,
            truncated: false,
            displayTimezone: null,
        }),
    };
    const aiService = {
        detectDataAppAnomalies: vi
            .fn()
            .mockResolvedValue({ detection, modelId: 'fast-model' }),
    };
    const service = new DataAppAnalysisService({
        dataAppAnalysisModel,
        appModel: {
            getApp: vi.fn().mockResolvedValue({
                app_id: 'app-1',
                project_uuid: 'proj-1',
                space_uuid: null,
                created_by_user_uuid: 'user-1',
                organization_uuid: 'org-1',
            }),
            getLatestReadyVersion: vi.fn().mockResolvedValue({ version: 3 }),
        },
        externalConnectionModel: {
            findProjectAbilityContext: vi.fn().mockResolvedValue({
                organizationUuid: 'org-1',
                projectType: 'DEFAULT',
                projectCreatedByUserUuid: null,
                upstreamProjectUuid: null,
            }),
        },
        featureFlagModel: {
            get: vi.fn(
                async ({ featureFlagId }: { featureFlagId: string }) => ({
                    enabled:
                        featureFlagId === FeatureFlags.EnableDataAppAnalysis
                            ? (overrides.analysisEnabled ?? true)
                            : (overrides.dataAppsEnabled ?? true),
                }),
            ),
        },
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue({}),
        },
        asyncQueryService,
        aiService,
        aiAgentService: {
            getIsCopilotEnabled: vi
                .fn()
                .mockResolvedValue(overrides.copilotEnabled ?? true),
        },
        aiOrganizationSettingsService: {
            isDataAppRuntimeAiEnabled: vi
                .fn()
                .mockResolvedValue(overrides.orgSettingEnabled ?? true),
        },
    } as never);
    vi.spyOn(
        service as unknown as { createAuditedAbility: () => unknown },
        'createAuditedAbility',
    ).mockReturnValue({ can: () => true, cannot: () => false });
    return { service, dataAppAnalysisModel, asyncQueryService, aiService };
}

const request = { sources: [{ queryUuid: 'q1', label: 'Orders by status' }] };

describe('DataAppAnalysisService.detect', () => {
    beforeEach(() => {
        vi.mocked(assertCanViewApp).mockResolvedValue({
            directOnly: false,
        } as never);
    });

    it('grounds anomalies, reports dropped ones, and persists the result', async () => {
        const { service, dataAppAnalysisModel, aiService } = buildService();

        const result = await service.detect(
            buildAccount(),
            'proj-1',
            'app-1',
            request,
        );

        expect(result.analysisId).toBe('analysis-1');
        expect(result.appVersion).toBe(3);
        expect(result.anomalies).toHaveLength(1);
        expect(result.anomalies[0].dimensionValues).toEqual({
            orders_status: 'returned',
        });
        expect(result.limitations).toEqual([
            'No prior period in the data',
            '1 finding could not be matched to the data and were left out',
        ]);
        expect(dataAppAnalysisModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                operation: 'detect',
                appVersion: 3,
                modelId: 'fast-model',
                result: expect.objectContaining({
                    anomalies: result.anomalies,
                }),
            }),
        );
        const content = aiService.detectDataAppAnomalies.mock.calls[0][1]
            .content as string;
        expect(content).toContain('## Orders by status');
        expect(content).toContain('Query: q1');
        expect(content).toContain('orders_total = "Total" (metric)');
    });

    it('rejects when the org setting is off, before touching any query', async () => {
        const { service, asyncQueryService, aiService } = buildService({
            orgSettingEnabled: false,
        });
        await expect(
            service.detect(buildAccount(), 'proj-1', 'app-1', request),
        ).rejects.toMatchObject({
            name: 'DataAppAnalysisUnavailableError',
            data: { code: 'org_setting_disabled' },
        });
        expect(
            asyncQueryService.getRawAsyncQueryResults,
        ).not.toHaveBeenCalled();
        expect(aiService.detectDataAppAnomalies).not.toHaveBeenCalled();
    });

    it.each([
        ['copilot', { copilotEnabled: false }, 'copilot_disabled'],
        ['data apps flag', { dataAppsEnabled: false }, 'data_apps_disabled'],
        ['analysis flag', { analysisEnabled: false }, 'analysis_disabled'],
    ])('rejects when %s is off', async (_label, overrides, code) => {
        const { service } = buildService(overrides);
        await expect(
            service.detect(buildAccount(), 'proj-1', 'app-1', request),
        ).rejects.toMatchObject({ data: { code } });
    });

    it('rejects embed JWT accounts as an unsupported context', async () => {
        const { service, aiService } = buildService();
        await expect(
            service.detect(
                buildAccount({ accountType: 'jwt' }),
                'proj-1',
                'app-1',
                request,
            ),
        ).rejects.toMatchObject({ data: { code: 'unsupported_context' } });
        expect(aiService.detectDataAppAnomalies).not.toHaveBeenCalled();
    });

    it('rejects sources that ran in a scheduled delivery', async () => {
        const { service, aiService } = buildService({
            queryContext: QueryExecutionContext.SCHEDULED_DELIVERY,
        });
        await expect(
            service.detect(buildAccount(), 'proj-1', 'app-1', request),
        ).rejects.toBeInstanceOf(DataAppAnalysisUnavailableError);
        expect(aiService.detectDataAppAnomalies).not.toHaveBeenCalled();
    });

    it('propagates a forbidden source query without calling the model', async () => {
        const { service, asyncQueryService, aiService } = buildService();
        asyncQueryService.getAsyncQueryHistory.mockRejectedValue(
            new ForbiddenError('User is not authorized to access this query'),
        );
        await expect(
            service.detect(buildAccount(), 'proj-1', 'app-1', request),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(aiService.detectDataAppAnomalies).not.toHaveBeenCalled();
    });

    it('rejects a viewer who cannot view the app', async () => {
        const { service } = buildService();
        vi.mocked(assertCanViewApp).mockRejectedValue(
            new ForbiddenError('Insufficient permissions'),
        );
        await expect(
            service.detect(buildAccount(), 'proj-1', 'app-1', request),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects an empty source list', async () => {
        const { service } = buildService();
        await expect(
            service.detect(buildAccount(), 'proj-1', 'app-1', { sources: [] }),
        ).rejects.toBeInstanceOf(ParameterError);
    });
});
