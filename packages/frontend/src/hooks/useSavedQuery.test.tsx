import {
    type CreateSavedChart,
    type CreateSavedChartVersion,
    type Project,
    type SavedChart,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectRouteContext } from './useProjectRoute';

const navigate = vi.fn();

vi.mock('react-router', () => ({
    useNavigate: () => navigate,
    useParams: () => ({ savedQueryUuid: 'legacy-chart' }),
}));

vi.mock('../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('./toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastError: vi.fn(),
        showToastApiError: vi.fn(),
    }),
}));

vi.mock('./useSearchParams', () => ({
    default: () => undefined,
}));

import { lightdashApi } from '../api';
import { useAddVersionMutation, useCreateMutation } from './useSavedQuery';

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            <ProjectRouteContext.Provider
                value={{
                    project: {} as Project,
                    projectUuid: 'project-uuid',
                    projectUrlIdentifier: 'jaffle-shop',
                }}
            >
                {children}
            </ProjectRouteContext.Provider>
        </QueryClientProvider>
    );
};

describe('useAddVersionMutation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(lightdashApi).mockResolvedValue({
            uuid: 'chart-uuid',
            slug: 'legacy-chart',
            projectUuid: 'project-uuid',
            hasUnpublishedChanges: false,
        } as SavedChart);
    });

    it('preserves the project URL identifier when returning to chart view', async () => {
        const { result } = renderHook(() => useAddVersionMutation(), {
            wrapper: createWrapper(),
        });

        await act(() =>
            result.current.mutateAsync({
                uuid: 'chart-uuid',
                payload: {
                    metricQuery: { filters: {} },
                } as CreateSavedChartVersion,
            }),
        );

        expect(navigate).toHaveBeenCalledWith(
            '/projects/jaffle-shop/saved/legacy-chart/view',
        );
    });
});

describe('useCreateMutation', () => {
    const payload = { metricQuery: { filters: {} } } as CreateSavedChart;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(lightdashApi).mockResolvedValue({
            uuid: 'chart-uuid',
            slug: 'new-chart',
            projectUuid: 'project-uuid',
        } as SavedChart);
    });

    it('saves to the route project by default', async () => {
        const { result } = renderHook(
            () => useCreateMutation({ redirectOnSuccess: false }),
            { wrapper: createWrapper() },
        );

        await act(() => result.current.mutateAsync(payload));

        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({ url: '/projects/project-uuid/saved' }),
        );
    });

    it('saves to an explicit projectUuid over the route project', async () => {
        const { result } = renderHook(
            () =>
                useCreateMutation({
                    redirectOnSuccess: false,
                    projectUuid: 'other-project-uuid',
                }),
            { wrapper: createWrapper() },
        );

        await act(() => result.current.mutateAsync(payload));

        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/other-project-uuid/saved',
            }),
        );
    });
});
