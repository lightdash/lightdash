import {
    DimensionType,
    SchedulerFormat,
    type Dashboard,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { vi, type Mock } from 'vitest';

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('../../features/scheduler/hooks/useScheduler', () => ({
    pollJobStatus: vi.fn(),
}));

const { showToastSuccess } = vi.hoisted(() => ({
    showToastSuccess: vi.fn(),
}));

vi.mock('../toaster/useToaster', () => ({
    default: () => ({
        showToastInfo: vi.fn(),
        showToastSuccess,
        showToastError: vi.fn(),
        showToastWarning: vi.fn(),
        showToastApiError: vi.fn(),
    }),
}));

vi.mock('../../providers/App/useApp', () => ({
    default: () => ({ user: { data: undefined } }),
}));

vi.mock('../useQueryError', () => ({
    default: () => vi.fn(),
}));

vi.mock('./useDashboardStorage', () => ({
    default: () => ({ clearDashboardStorage: vi.fn() }),
}));

vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
    useParams: () => ({}),
}));

import { lightdashApi } from '../../api';
import { pollJobStatus } from '../../features/scheduler/hooks/useScheduler';
import {
    useDashboardsAvailableFilters,
    useExportDashboardContentPreview,
    useUpdateDashboard,
} from './useDashboard';

const mockApi = lightdashApi as unknown as Mock;
const mockPollJobStatus = pollJobStatus as unknown as Mock;

const dashboard = {
    uuid: 'dashboard-uuid',
    name: 'My dashboard',
    projectUuid: 'project-uuid',
} as Dashboard;

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

describe('useExportDashboardContentPreview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('schedules an async image export and resolves with the preview url', async () => {
        mockApi.mockResolvedValue({ jobId: 'job-1' });
        mockPollJobStatus.mockResolvedValue({
            url: 'https://example.com/preview.png',
            fileType: 'image',
        });

        const { result } = renderHook(
            () => useExportDashboardContentPreview(),
            { wrapper: createWrapper() },
        );

        const url = await result.current.mutateAsync({
            dashboard,
            customViewportWidth: 1400,
            selectedTabs: ['tab-1'],
        });

        expect(url).toBe('https://example.com/preview.png');
        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: `/dashboards/${dashboard.uuid}/exports?projectUuid=${dashboard.projectUuid}`,
                version: 'v2',
                method: 'POST',
            }),
        );
        const body = JSON.parse(mockApi.mock.calls[0][0].body);
        expect(body).toEqual(
            expect.objectContaining({
                format: SchedulerFormat.IMAGE,
                customViewportWidth: 1400,
                selectedTabs: ['tab-1'],
            }),
        );
        expect(mockPollJobStatus).toHaveBeenCalledWith(
            'job-1',
            dashboard.projectUuid,
        );
    });

    it('rejects when the job completes without a url', async () => {
        mockApi.mockResolvedValue({ jobId: 'job-2' });
        mockPollJobStatus.mockResolvedValue(null);

        const { result } = renderHook(
            () => useExportDashboardContentPreview(),
            { wrapper: createWrapper() },
        );

        await expect(
            result.current.mutateAsync({ dashboard }),
        ).rejects.toThrow();

        await waitFor(() => expect(result.current.isError).toBe(true));
    });
});

describe('useUpdateDashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('says a draft was saved when the save is held for review', async () => {
        mockApi.mockResolvedValue({
            ...dashboard,
            slug: 'my-dashboard',
            hasUnpublishedChanges: true,
        });

        const { result } = renderHook(
            () => useUpdateDashboard(dashboard.uuid, dashboard.projectUuid),
            { wrapper: createWrapper() },
        );

        await result.current.mutateAsync({ name: 'Renamed dashboard' });

        expect(showToastSuccess).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Dashboard draft saved for review',
                subtitle:
                    'Only you can see these changes until a reviewer writes them back to the repo.',
            }),
        );
    });

    it('keeps the generic toast when the save is published', async () => {
        mockApi.mockResolvedValue({ ...dashboard, slug: 'my-dashboard' });

        const { result } = renderHook(
            () => useUpdateDashboard(dashboard.uuid, dashboard.projectUuid),
            { wrapper: createWrapper() },
        );

        await result.current.mutateAsync({ name: 'Renamed dashboard' });

        expect(showToastSuccess).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Success! Dashboard name was updated.',
            }),
        );
        expect(showToastSuccess.mock.calls[0][0]).not.toHaveProperty(
            'subtitle',
        );
    });
});

describe('useDashboardsAvailableFilters', () => {
    const savedChartUuidsAndTileUuids = [
        { tileUuid: 'tile-1', savedChartUuid: 'chart-1' },
    ];

    const emptyResponse = {
        savedQueryFilters: {},
        allFilterableFields: [],
        allFilterableMetrics: [],
        savedQueryMetricFilters: {},
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockApi.mockResolvedValue(emptyResponse);
    });

    it('asks the standard endpoint for the status of one dashboard', async () => {
        const { result } = renderHook(
            () =>
                useDashboardsAvailableFilters(
                    savedChartUuidsAndTileUuids,
                    'project-uuid',
                    undefined,
                    'dashboard-uuid',
                ),
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/dashboards/availableFilters?dashboardUuid=dashboard-uuid',
                method: 'POST',
                body: JSON.stringify(savedChartUuidsAndTileUuids),
            }),
        );
    });

    it('omits the parameter entirely when no dashboard is known', async () => {
        const { result } = renderHook(
            () =>
                useDashboardsAvailableFilters(
                    savedChartUuidsAndTileUuids,
                    'project-uuid',
                ),
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/dashboards/availableFilters',
            }),
        );
    });

    it("keeps each dashboard's own status when two share a tile and chart", async () => {
        const statusFor = (fieldId: string) => ({
            ...emptyResponse,
            savedFilterFieldsByTile: {
                'tile-1': [{ fieldId, fallbackType: DimensionType.STRING }],
            },
        });
        mockApi.mockImplementation(({ url }: { url: string }) =>
            Promise.resolve(
                statusFor(
                    url.endsWith('dashboard-a')
                        ? 'orders_hidden_a'
                        : 'orders_hidden_b',
                ),
            ),
        );

        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false, staleTime: Infinity },
            },
        });
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );

        const first = renderHook(
            () =>
                useDashboardsAvailableFilters(
                    savedChartUuidsAndTileUuids,
                    'project-uuid',
                    undefined,
                    'dashboard-a',
                ),
            { wrapper },
        );
        await waitFor(() => expect(first.result.current.isSuccess).toBe(true));

        const second = renderHook(
            () =>
                useDashboardsAvailableFilters(
                    savedChartUuidsAndTileUuids,
                    'project-uuid',
                    undefined,
                    'dashboard-b',
                ),
            { wrapper },
        );
        await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

        expect(
            first.result.current.data?.savedFilterFieldsByTile?.['tile-1'],
        ).toEqual([
            { fieldId: 'orders_hidden_a', fallbackType: DimensionType.STRING },
        ]);
        expect(
            second.result.current.data?.savedFilterFieldsByTile?.['tile-1'],
        ).toEqual([
            { fieldId: 'orders_hidden_b', fallbackType: DimensionType.STRING },
        ]);
    });

    it('leaves the embed endpoint untouched', async () => {
        const { result } = renderHook(
            () =>
                useDashboardsAvailableFilters(
                    savedChartUuidsAndTileUuids,
                    'project-uuid',
                    'embed-token',
                    'dashboard-uuid',
                ),
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/embed/project-uuid/dashboard/availableFilters',
            }),
        );
    });
});
