import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { captureChartTypeError } from '../utils/captureChartTypeError';
import { useUpgradeAllRegistryChartTypes } from './useInstallRegistryChartType';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../../hooks/toaster/useToaster', () => ({ default: vi.fn() }));
vi.mock('../utils/captureChartTypeError', () => ({
    captureChartTypeError: vi.fn(),
}));

const showToastSuccess = vi.fn();
const showToastError = vi.fn();

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

const charts = [
    { slug: 'gauge', name: 'Gauge' },
    { slug: 'globe', name: 'Globe' },
    { slug: 'venn', name: 'Venn' },
];

describe('useUpgradeAllRegistryChartTypes', () => {
    beforeEach(() => {
        vi.mocked(lightdashApi).mockReset();
        vi.mocked(useToaster).mockReturnValue({
            showToastSuccess,
            showToastError,
        } as unknown as ReturnType<typeof useToaster>);
        showToastSuccess.mockReset();
        showToastError.mockReset();
    });

    it('upgrades one chart type at a time and keeps going after a failure', async () => {
        const apiError = { error: { message: 'artifact missing' } };
        vi.mocked(lightdashApi).mockImplementation(({ url }) =>
            url.includes('/globe/')
                ? Promise.reject(apiError)
                : Promise.resolve({
                      appUuid: 'app',
                      upgradedChartCount: 2,
                  } as never),
        );
        const { result } = renderHook(() => useUpgradeAllRegistryChartTypes(), {
            wrapper: createWrapper(),
        });

        await act(() =>
            result.current.mutateAsync({
                projectUuid: 'project-1',
                charts,
                upgradeConsumingCharts: true,
            }),
        );

        expect(
            vi.mocked(lightdashApi).mock.calls.map(([args]) => args.url),
        ).toEqual([
            '/ee/projects/project-1/apps/registry/charts/gauge/install',
            '/ee/projects/project-1/apps/registry/charts/globe/install',
            '/ee/projects/project-1/apps/registry/charts/venn/install',
        ]);
        expect(vi.mocked(lightdashApi).mock.calls[0][0].body).toBe(
            JSON.stringify({ upgradeConsumingCharts: true }),
        );
        expect(showToastSuccess).toHaveBeenCalledWith({
            title: '2 chart types upgraded',
            subtitle: '4 saved charts moved to the new versions',
        });
        expect(showToastError).toHaveBeenCalledWith({
            title: 'Failed to upgrade 1 chart type',
            subtitle: 'Globe',
        });
        expect(captureChartTypeError).toHaveBeenCalledWith(
            'chartTypeInstall',
            apiError,
            { projectUuid: 'project-1', chartSlug: 'globe' },
        );
    });
});
