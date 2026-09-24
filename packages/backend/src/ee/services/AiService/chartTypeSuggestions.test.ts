import { Ability } from '@casl/ability';
import {
    DimensionType,
    FieldType,
    ForbiddenError,
    MetricType,
    type DataAppVizField,
    type Explore,
    type SessionUser,
} from '@lightdash/common';
import { generateText } from 'ai';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { AiService } from './AiService';

vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));
vi.mock('../../../analytics/aiUsage', () => ({
    emitAiUsage: vi.fn(),
    languageModelUsageToTokens: vi.fn(),
}));
vi.mock('../ai/models', () => ({
    getModel: () => ({ model: 'test', keyManagement: null }),
}));

const rules = (canManageExplore: boolean) =>
    canManageExplore ? [{ action: 'manage', subject: 'Explore' }] : [];

const makeUser = (canManageExplore = true) =>
    ({
        organizationUuid: 'org',
        userUuid: 'user',
        ability: new Ability(rules(canManageExplore)),
        abilityRules: rules(canManageExplore),
    }) as unknown as SessionUser;

const field = (
    fieldType: FieldType,
    name: string,
    type: DimensionType | MetricType,
) => ({
    fieldType,
    table: 'orders',
    tableLabel: 'Orders',
    name,
    label: name,
    type,
    hidden: false,
});

const makeExplore = (name: string, withMetrics: boolean): Explore =>
    ({
        name,
        label: name,
        baseTable: 'orders',
        joinedTables: [],
        tables: {
            orders: {
                name: 'orders',
                label: 'Orders',
                dimensions: {
                    status: field(
                        FieldType.DIMENSION,
                        'status',
                        DimensionType.STRING,
                    ),
                },
                metrics: withMetrics
                    ? {
                          revenue: field(
                              FieldType.METRIC,
                              'revenue',
                              MetricType.SUM,
                          ),
                      }
                    : {},
            },
        },
    }) as unknown as Explore;

const inputs: DataAppVizField[] = [
    { name: 'value', label: 'Value', type: 'metric', required: true },
    { name: 'x', label: 'X', type: 'dimension', required: true },
];

const setup = ({ ambientEnabled = true } = {}) => {
    const projectService = {
        getProject: vi.fn().mockResolvedValue({ organizationUuid: 'org' }),
        getExplore: vi.fn(),
        getAllExploresSummary: vi.fn(),
        findExplores: vi.fn(),
    };
    const analytics = { track: vi.fn() };
    const service = new AiService({
        lightdashConfig: lightdashConfigMock,
        projectService,
        analytics,
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: ambientEnabled }),
        },
        orgAiCopilotConfigResolver: {
            getCopilotConfig: vi.fn().mockResolvedValue({ providers: {} }),
            getAccessibleModelIds: vi.fn(),
        },
    } as unknown as ConstructorParameters<typeof AiService>[0]);
    return { service, projectService, analytics };
};

beforeEach(() => vi.mocked(generateText).mockReset());

const abortError = () =>
    new DOMException('The operation was aborted', 'AbortError');

describe('suggestChartTypeFields', () => {
    it('returns validated picks for every declared input', async () => {
        const { service, projectService, analytics } = setup();
        projectService.getExplore.mockResolvedValue(
            makeExplore('orders', true),
        );
        vi.mocked(generateText).mockResolvedValue({
            output: {
                suggestions: [
                    {
                        fieldName: 'value',
                        fieldIds: ['orders_revenue'],
                        reason: 'Revenue is the amount.',
                        alternatives: [],
                    },
                    {
                        fieldName: 'x',
                        fieldIds: ['orders_revenue'],
                        reason: 'Wrong kind.',
                        alternatives: [
                            { fieldId: 'orders_status', reason: 'Status.' },
                        ],
                    },
                ],
            },
            usage: {},
        } as never);

        const result = await service.suggestChartTypeFields(
            makeUser(),
            'project',
            {
                prompt: 'Revenue by status',
                clarifications: [],
                exploreName: 'orders',
                fields: inputs,
            },
        );

        expect(result.suggestions).toEqual([
            {
                fieldName: 'value',
                fieldIds: ['orders_revenue'],
                reason: 'Revenue is the amount.',
                alternatives: [],
            },
            {
                fieldName: 'x',
                fieldIds: ['orders_status'],
                reason: 'Status.',
                alternatives: [],
            },
        ]);
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'ai.chart_type_fields.suggested',
            }),
        );
    });

    it('throws ForbiddenError when ambient AI is off', async () => {
        const { service, projectService } = setup({ ambientEnabled: false });
        projectService.getExplore.mockResolvedValue(
            makeExplore('orders', true),
        );
        await expect(
            service.suggestChartTypeFields(makeUser(), 'project', {
                prompt: 'p',
                clarifications: [],
                exploreName: 'orders',
                fields: inputs,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(generateText).not.toHaveBeenCalled();
    });

    it('answers empty entries when the model times out', async () => {
        const { service, projectService, analytics } = setup();
        projectService.getExplore.mockResolvedValue(
            makeExplore('orders', true),
        );
        vi.mocked(generateText).mockRejectedValueOnce(abortError());

        const result = await service.suggestChartTypeFields(
            makeUser(),
            'project',
            {
                prompt: 'p',
                clarifications: [],
                exploreName: 'orders',
                fields: inputs,
            },
        );

        expect(result.suggestions).toEqual([
            {
                fieldName: 'value',
                fieldIds: [],
                reason: 'No field in orders clearly fits Value.',
                alternatives: [],
            },
            {
                fieldName: 'x',
                fieldIds: [],
                reason: 'No field in orders clearly fits X.',
                alternatives: [],
            },
        ]);
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'ai.chart_type_fields.suggested',
                properties: expect.objectContaining({ timedOut: true }),
            }),
        );
    });

    it('throws ForbiddenError without explore access', async () => {
        const { service } = setup();
        await expect(
            service.suggestChartTypeFields(makeUser(false), 'project', {
                prompt: 'p',
                clarifications: [],
                exploreName: 'orders',
                fields: inputs,
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(generateText).not.toHaveBeenCalled();
    });
});

describe('suggestChartTypeExplore', () => {
    const summaries = [
        { name: 'orders', label: 'Orders', tags: [] },
        { name: 'broken', label: 'Broken', errors: [{ message: 'x' }] },
    ];

    it('returns null when the picked explore lacks a needed metric', async () => {
        const { service, projectService } = setup();
        projectService.getAllExploresSummary.mockResolvedValue(summaries);
        projectService.findExplores.mockResolvedValue({
            orders: makeExplore('orders', false),
        });
        vi.mocked(generateText).mockResolvedValue({
            output: { exploreName: 'orders', reason: 'Orders has status.' },
            usage: {},
        } as never);

        expect(
            await service.suggestChartTypeExplore(makeUser(), 'project', {
                prompt: 'Revenue by status',
                clarifications: [],
                fields: inputs,
            }),
        ).toEqual({ suggestion: null });
        expect(projectService.getAllExploresSummary).toHaveBeenCalledWith(
            expect.anything(),
            'project',
            true,
            false,
        );
        expect(projectService.findExplores).toHaveBeenCalledWith(
            expect.objectContaining({ exploreNames: ['orders'] }),
        );
    });

    it('answers null when the model times out', async () => {
        const { service, projectService, analytics } = setup();
        projectService.getAllExploresSummary.mockResolvedValue(summaries);
        projectService.findExplores.mockResolvedValue({
            orders: makeExplore('orders', true),
        });
        vi.mocked(generateText).mockRejectedValueOnce(abortError());

        expect(
            await service.suggestChartTypeExplore(makeUser(), 'project', {
                prompt: 'p',
                clarifications: [],
                fields: inputs,
            }),
        ).toEqual({ suggestion: null });
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'ai.chart_type_explore.suggested',
                properties: expect.objectContaining({ timedOut: true }),
            }),
        );
    });

    it('returns the pick when the explore fits the inputs', async () => {
        const { service, projectService } = setup();
        projectService.getAllExploresSummary.mockResolvedValue(summaries);
        projectService.findExplores.mockResolvedValue({
            orders: makeExplore('orders', true),
        });
        vi.mocked(generateText).mockResolvedValue({
            output: {
                exploreName: 'orders',
                reason: 'Orders has revenue and status: the chart wants both.',
            },
            usage: {},
        } as never);

        expect(
            await service.suggestChartTypeExplore(makeUser(), 'project', {
                prompt: 'Revenue by status',
                clarifications: [],
                fields: inputs,
            }),
        ).toEqual({
            suggestion: {
                exploreName: 'orders',
                reason: 'Orders has revenue and status: the chart wants both.',
            },
        });
    });

    it('throws ForbiddenError when ambient AI is off', async () => {
        const { service } = setup({ ambientEnabled: false });
        await expect(
            service.suggestChartTypeExplore(makeUser(), 'project', {
                prompt: 'p',
                clarifications: [],
                fields: inputs,
            }),
        ).rejects.toThrow(ForbiddenError);
    });
});
