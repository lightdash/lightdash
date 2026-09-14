import { type SessionUser } from '@lightdash/common';
import {
    compareChartQueries,
    type ChartSimilarityInput,
} from '../ai/agents/chartSimilarity';
import { AiService } from './AiService';

vi.mock('../ai/agents/chartSimilarity', () => ({
    compareChartQueries: vi.fn(),
}));
vi.mock('../ai/models', () => ({
    getModel: () => ({ model: 'test', keyManagement: null }),
}));

const user = { organizationUuid: 'org', userUuid: 'user' } as SessionUser;
const input: ChartSimilarityInput = {
    source: {
        name: 'Revenue',
        metricQuery: {
            exploreName: 'orders',
            metrics: ['orders_revenue'],
            dimensions: [],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        },
    },
    candidates: [],
};
const setup = () => {
    const featureFlagService = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const service = new AiService({
        featureFlagService,
        orgAiCopilotConfigResolver: {
            getCopilotConfig: vi.fn().mockResolvedValue({ providers: {} }),
        },
    } as unknown as ConstructorParameters<typeof AiService>[0]);
    return { service, featureFlagService };
};
beforeEach(() =>
    vi.mocked(compareChartQueries).mockReset().mockResolvedValue([]),
);

it('reuses completed comparisons and invalidates on query changes', async () => {
    const { service } = setup();
    await service.compareCharts(user, 'project', input);
    await service.compareCharts(user, 'project', input);
    expect(compareChartQueries).toHaveBeenCalledTimes(1);
    await service.compareCharts(user, 'project', {
        ...input,
        source: { ...input.source, parameters: { period: 'last_year' } },
    });
    expect(compareChartQueries).toHaveBeenCalledTimes(2);
});

it('isolates the cache by user and project', async () => {
    const { service } = setup();
    await service.compareCharts(user, 'project', input);
    await service.compareCharts(
        { ...user, userUuid: 'another-user' },
        'project',
        input,
    );
    await service.compareCharts(user, 'another-project', input);
    expect(compareChartQueries).toHaveBeenCalledTimes(3);
});

it('does not start a model call when a review submission has no cached result', async () => {
    const { service } = setup();
    expect(
        await service.compareCharts(user, 'project', input, true),
    ).toBeUndefined();
    expect(compareChartQueries).not.toHaveBeenCalled();
});

it('deduplicates concurrent calls but does not make a submission wait for them', async () => {
    const { service } = setup();
    let finish: (value: []) => void;
    vi.mocked(compareChartQueries).mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    const first = service.compareCharts(user, 'project', input);
    const second = service.compareCharts(user, 'project', input);
    expect(
        await service.compareCharts(user, 'project', input, true),
    ).toBeUndefined();
    await vi.waitFor(() =>
        expect(compareChartQueries).toHaveBeenCalledTimes(1),
    );
    finish!([]);
    expect(await Promise.all([first, second])).toEqual([[], []]);
});

it('allows retry after a failed call without retaining a rejected promise', async () => {
    const { service } = setup();
    vi.mocked(compareChartQueries).mockRejectedValueOnce(
        new Error('Provider unavailable'),
    );
    await expect(service.compareCharts(user, 'project', input)).rejects.toThrow(
        'Provider unavailable',
    );
    expect(await service.compareCharts(user, 'project', input)).toEqual([]);
    expect(compareChartQueries).toHaveBeenCalledTimes(2);
});

it('enforces Ambient AI availability before calling the model', async () => {
    const { service, featureFlagService } = setup();
    featureFlagService.get.mockResolvedValue({ enabled: false });
    await expect(service.compareCharts(user, 'project', input)).rejects.toThrow(
        'Ambient AI is not available',
    );
    expect(compareChartQueries).not.toHaveBeenCalled();
});
