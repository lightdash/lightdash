import { SchedulerFormat, type Dashboard } from '@lightdash/common';
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
