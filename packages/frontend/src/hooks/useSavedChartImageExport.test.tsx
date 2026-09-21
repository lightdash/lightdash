import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const showToastError = vi.fn();

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../components/common/ChartDownload/chartDownloadUtils', () => ({
    downloadImageUrl: vi.fn(),
}));
vi.mock('./toaster/useToaster', () => ({
    default: () => ({ showToastError }),
}));

import { lightdashApi } from '../api';
import { downloadImageUrl } from '../components/common/ChartDownload/chartDownloadUtils';
import { useSavedChartImageExport } from './useSavedChartImageExport';

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

describe('useSavedChartImageExport', () => {
    beforeEach(() => vi.clearAllMocks());

    it('exports the saved chart PNG and downloads the resulting URL', async () => {
        vi.mocked(lightdashApi).mockResolvedValue(
            'https://images.example/chart.png',
        );
        const { result } = renderHook(() => useSavedChartImageExport(), {
            wrapper: createWrapper(),
        });

        await act(() =>
            result.current.mutateAsync({
                chartUuid: 'chart-uuid',
                projectUuid: 'project uuid',
                chartName: 'My chart',
            }),
        );

        expect(lightdashApi).toHaveBeenCalledWith({
            url: '/saved/chart-uuid/export?projectUuid=project%20uuid',
            method: 'POST',
            body: undefined,
        });
        expect(downloadImageUrl).toHaveBeenCalledWith(
            'https://images.example/chart.png',
            'My chart',
        );
    });

    it('shows an error and does not download when export fails', async () => {
        vi.mocked(lightdashApi).mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useSavedChartImageExport(), {
            wrapper: createWrapper(),
        });

        await expect(
            result.current.mutateAsync({
                chartUuid: 'chart-uuid',
                projectUuid: 'project-uuid',
            }),
        ).rejects.toThrow('offline');

        expect(downloadImageUrl).not.toHaveBeenCalled();
        expect(showToastError).toHaveBeenCalledWith({
            title: 'Unable to download chart image',
        });
    });
});
