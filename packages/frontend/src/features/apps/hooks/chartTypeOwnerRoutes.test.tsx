import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    appApiBase,
    appQueryKey,
    type ChartTypeOwner,
} from '../../chartTypes/utils/chartTypeOwner';
import { useAppFileUpload } from './useAppFileUpload';
import { useAppPreviewToken } from './useAppPreviewToken';
import { useCancelAppVersion } from './useCancelAppVersion';
import { useClarifyApp } from './useClarifyApp';
import { useClearAgentContext } from './useClearAgentContext';
import { useGenerateApp } from './useGenerateApp';
import { useGetApp } from './useGetApp';
import { useIterateApp } from './useIterateApp';
import { useRestoreAppVersion } from './useRestoreAppVersion';
import { useUpdateApp } from './useUpdateApp';

const lightdashApi = vi.hoisted(() => vi.fn());

vi.mock('../../../api', () => ({ lightdashApi }));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastApiError: vi.fn(),
    }),
}));
vi.mock('../../../hooks/useContent', () => ({
    invalidateContent: vi.fn(),
}));

const setup = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
    return { queryClient, wrapper };
};

const lastRequest = () =>
    lightdashApi.mock.lastCall?.[0] as {
        method: string;
        url: string;
        body?: string;
    };

const lastBody = () => JSON.parse(lastRequest().body ?? '{}');

describe('chart type owner routes', () => {
    beforeEach(() => {
        lightdashApi.mockReset();
        lightdashApi.mockResolvedValue({ appUuid: 'app-1', version: 1 });
    });

    it('serves each owner from its own API base and cache', () => {
        expect(appApiBase('project', 'project-1')).toBe(
            '/ee/projects/project-1/apps',
        );
        expect(appApiBase('organization', 'project-1')).toBe(
            '/ee/org/chart-types',
        );
        expect(appQueryKey('project', 'project-1', 'app-1')).toEqual([
            'app',
            'project-1',
            'app-1',
        ]);
        // The same organization chart type from every project.
        expect(appQueryKey('organization', 'project-1', 'app-1')).toEqual([
            'organization-chart-type',
            'app-1',
        ]);
    });

    it.each<[ChartTypeOwner, string, unknown[]]>([
        [
            'project',
            '/ee/projects/project-1/apps/app-1?limit=5',
            ['app', 'project-1', 'app-1'],
        ],
        [
            'organization',
            '/ee/org/chart-types/app-1?limit=5',
            ['organization-chart-type', 'app-1'],
        ],
    ])('reads a %s app with its own key', async (owner, url, queryKey) => {
        lightdashApi.mockResolvedValue({ versions: [], hasMore: false });
        const { queryClient, wrapper } = setup();
        renderHook(() => useGetApp('project-1', 'app-1', owner), { wrapper });

        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({ method: 'GET', url }),
            ),
        );
        expect(queryClient.getQueryState(queryKey)).toBeDefined();
    });

    it.each<[ChartTypeOwner, string, unknown[]]>([
        [
            'project',
            '/ee/projects/project-1/apps/app-1/versions/2/preview-token',
            ['app-preview-token', 'project-1', 'app-1', 2],
        ],
        [
            'organization',
            '/ee/org/chart-types/app-1/versions/2/preview-token',
            ['organization-chart-type-preview-token', 'app-1', 2],
        ],
    ])('mints a %s preview token', async (owner, url, queryKey) => {
        lightdashApi.mockResolvedValue({ token: 'token-1' });
        const { queryClient, wrapper } = setup();
        renderHook(() => useAppPreviewToken('project-1', 'app-1', 2, owner), {
            wrapper,
        });

        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({ url }),
            ),
        );
        expect(queryClient.getQueryState(queryKey)).toBeDefined();
    });

    describe('generate', () => {
        const params = {
            projectUuid: 'project-1',
            prompt: 'a funnel',
            template: 'data_app_viz' as const,
            creationExperience: 'chart_type_builder' as const,
            appUuid: 'app-1',
            spaceUuid: 'space-1',
            externalConnections: [
                { externalConnectionUuid: 'stores', alias: 'stores' },
            ],
        };

        it('sends project builds with their template, space and connections', async () => {
            const { wrapper } = setup();
            const { result } = renderHook(() => useGenerateApp(), { wrapper });
            await result.current.mutateAsync({
                ...params,
                target: { owner: 'project' },
            });

            expect(lastRequest().url).toBe('/ee/projects/project-1/apps/');
            expect(lastBody()).toEqual(
                expect.objectContaining({
                    template: 'data_app_viz',
                    spaceUuid: 'space-1',
                    externalConnections: params.externalConnections,
                }),
            );
            expect(lastBody()).not.toHaveProperty('dataProjectUuid');
        });

        it.each([null, 'project-1'])(
            'sends organization builds with dataProjectUuid %s and no connections',
            async (dataProjectUuid) => {
                const { wrapper } = setup();
                const { result } = renderHook(() => useGenerateApp(), {
                    wrapper,
                });
                await result.current.mutateAsync({
                    ...params,
                    target: { owner: 'organization', dataProjectUuid },
                });

                expect(lastRequest().url).toBe('/ee/org/chart-types/');
                const body = lastBody();
                expect(body.dataProjectUuid).toBe(dataProjectUuid);
                expect(body).toHaveProperty('dataProjectUuid');
                expect(body).not.toHaveProperty('externalConnections');
                expect(body).not.toHaveProperty('template');
                expect(body).not.toHaveProperty('spaceUuid');
                expect(body.appUuid).toBe('app-1');
            },
        );
    });

    it('iterates an organization chart type without connections', async () => {
        const { wrapper } = setup();
        const { result } = renderHook(() => useIterateApp(), { wrapper });
        await result.current.mutateAsync({
            projectUuid: 'project-1',
            appUuid: 'app-1',
            prompt: 'make it teal',
            creationExperience: 'chart_type_builder',
            externalConnections: [
                { externalConnectionUuid: 'stores', alias: 'stores' },
            ],
            target: { owner: 'organization', dataProjectUuid: null },
        });

        expect(lastRequest().url).toBe('/ee/org/chart-types/app-1/versions');
        expect(lastBody()).toEqual(
            expect.objectContaining({ dataProjectUuid: null }),
        );
        expect(lastBody()).not.toHaveProperty('externalConnections');
    });

    it('iterates a project chart type as before', async () => {
        const { wrapper } = setup();
        const { result } = renderHook(() => useIterateApp(), { wrapper });
        await result.current.mutateAsync({
            projectUuid: 'project-1',
            appUuid: 'app-1',
            prompt: 'make it teal',
            creationExperience: 'chart_type_builder',
            target: { owner: 'project' },
        });

        expect(lastRequest().url).toBe(
            '/ee/projects/project-1/apps/app-1/versions',
        );
        expect(lastBody()).not.toHaveProperty('dataProjectUuid');
    });

    it('clarifies an organization chart type with its data project', async () => {
        lightdashApi.mockResolvedValue({ questions: [] });
        const { wrapper } = setup();
        const { result } = renderHook(() => useClarifyApp(), { wrapper });
        await result.current.mutateAsync({
            projectUuid: 'project-1',
            prompt: 'a funnel',
            template: 'data_app_viz',
            target: { owner: 'organization', dataProjectUuid: 'project-1' },
        });

        expect(lastRequest().url).toBe('/ee/org/chart-types/clarify');
        expect(lastBody()).toEqual({
            prompt: 'a funnel',
            dataProjectUuid: 'project-1',
        });
    });

    it.each<[ChartTypeOwner, string]>([
        ['project', '/ee/projects/project-1/apps/app-1/versions/3/cancel'],
        ['organization', '/ee/org/chart-types/app-1/versions/3/cancel'],
    ])('cancels a %s version', async (owner, url) => {
        const { wrapper } = setup();
        const { result } = renderHook(() => useCancelAppVersion(), {
            wrapper,
        });
        await result.current.mutateAsync({
            projectUuid: 'project-1',
            appUuid: 'app-1',
            version: 3,
            owner,
        });
        expect(lastRequest().url).toBe(url);
    });

    it('restores an organization version and refreshes its cache only', async () => {
        const { queryClient, wrapper } = setup();
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
        const { result } = renderHook(() => useRestoreAppVersion(), {
            wrapper,
        });
        await result.current.mutateAsync({
            projectUuid: 'project-1',
            appUuid: 'app-1',
            version: 3,
            owner: 'organization',
        });

        expect(lastRequest().url).toBe(
            '/ee/org/chart-types/app-1/versions/3/restore',
        );
        await waitFor(() =>
            expect(invalidateQueries).toHaveBeenCalledWith({
                queryKey: ['organization-chart-type', 'app-1'],
            }),
        );
        expect(invalidateQueries).not.toHaveBeenCalledWith({
            queryKey: ['app', 'project-1', 'app-1'],
        });
    });

    it('clears an organization chart type’s agent context', async () => {
        const { wrapper } = setup();
        const { result } = renderHook(
            () => useClearAgentContext('project-1', 'app-1', 'organization'),
            { wrapper },
        );
        await result.current.mutateAsync();
        expect(lastRequest().url).toBe('/ee/org/chart-types/app-1/threads');
    });

    it('renames an organization chart type and refreshes the library', async () => {
        const { queryClient, wrapper } = setup();
        const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
        const { result } = renderHook(() => useUpdateApp(), { wrapper });
        await result.current.mutateAsync({
            projectUuid: 'project-1',
            appUuid: 'app-1',
            owner: 'organization',
            name: 'Funnel',
        });

        expect(lastRequest()).toEqual(
            expect.objectContaining({
                method: 'PATCH',
                url: '/ee/org/chart-types/app-1',
            }),
        );
        expect(lastBody()).toEqual({ name: 'Funnel' });
        await waitFor(() => {
            expect(invalidateQueries).toHaveBeenCalledWith({
                queryKey: ['organization-chart-type', 'app-1'],
            });
            expect(invalidateQueries).toHaveBeenCalledWith({
                queryKey: ['organization-data-app-vizs'],
            });
        });
    });

    describe('file upload', () => {
        const fetchMock = vi.fn();
        beforeEach(() => {
            fetchMock.mockReset();
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ results: { fileId: 'file-1' } }),
            });
            vi.stubGlobal('fetch', fetchMock);
        });
        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it.each<[ChartTypeOwner, string]>([
            [
                'project',
                '/api/v1/ee/projects/project-1/apps/app-1/upload-file?filename=a.png',
            ],
            [
                'organization',
                '/api/v1/ee/org/chart-types/app-1/upload-file?filename=a.png',
            ],
        ])('uploads a %s attachment', async (owner, url) => {
            const { wrapper } = setup();
            const { result } = renderHook(() => useAppFileUpload(), {
                wrapper,
            });
            await result.current.mutateAsync({
                projectUuid: 'project-1',
                appUuid: 'app-1',
                file: new File(['x'], 'a.png', { type: 'image/png' }),
                owner,
            });
            expect(fetchMock.mock.lastCall?.[0]).toBe(url);
        });
    });
});
