import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePinnedContext } from './usePinnedContext';

const { useGetAppMock, useSavedQueryMock, useDashboardQueryMock } = vi.hoisted(
    () => ({
        useGetAppMock: vi.fn(),
        useSavedQueryMock: vi.fn(),
        useDashboardQueryMock: vi.fn(),
    }),
);

vi.mock('../../../../features/apps/hooks/useGetApp', () => ({
    useGetApp: useGetAppMock,
}));
vi.mock('../../../../hooks/useSavedQuery', () => ({
    useSavedQuery: useSavedQueryMock,
}));
vi.mock('../../../../hooks/dashboard/useDashboard', () => ({
    useDashboardQuery: useDashboardQueryMock,
}));

const projectUuid = 'project-1';

let queryClient = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const app = {
    appUuid: 'app-1',
    name: 'Sales explorer',
    slug: 'sales-explorer',
    latestReadyVersion: 3,
    spaceUuid: 'space-1',
};

const dashboard = {
    uuid: 'dashboard-1',
    slug: 'orders',
    name: 'Orders',
    spaceName: 'Space',
    tiles: [],
};

describe('usePinnedContext', () => {
    beforeEach(() => {
        queryClient = new QueryClient();
        useGetAppMock.mockReset();
        useSavedQueryMock.mockReset().mockReturnValue({ data: undefined });
        useDashboardQueryMock.mockReset().mockReturnValue({ data: undefined });
        useGetAppMock.mockReturnValue({ data: { pages: [app] } });
    });

    it.each([
        ['uuid', 'app-1'],
        ['slug', 'sales-explorer'],
    ])(
        'resolves a data app %s into context input and preview chip',
        (_label, dataAppUuidOrSlug) => {
            const { result } = renderHook(
                () => usePinnedContext({ projectUuid, dataAppUuidOrSlug }),
                { wrapper },
            );

            expect(useGetAppMock).toHaveBeenCalledWith(
                projectUuid,
                dataAppUuidOrSlug,
            );
            expect(result.current.isReady).toBe(true);
            expect(result.current.contextInput).toEqual([
                {
                    type: 'data_app',
                    appUuid: 'app-1',
                    appSlug: 'sales-explorer',
                },
            ]);
            expect(result.current.previewItems).toEqual([
                {
                    type: 'data_app',
                    appUuid: 'app-1',
                    appSlug: 'sales-explorer',
                    displayName: 'Sales explorer',
                    pinnedVersion: 3,
                    isPersonal: false,
                },
            ]);
            expect(result.current.contentMentionItems).toEqual([
                expect.objectContaining({
                    contentType: 'data_app',
                    uuid: 'app-1',
                    slug: 'sales-explorer',
                    label: 'Sales explorer',
                    isPersonalDataApp: false,
                    group: 'current',
                }),
            ]);
        },
    );

    it('is not ready until the data app resolves', () => {
        useGetAppMock.mockReturnValue({ data: undefined });

        const { result } = renderHook(
            () => usePinnedContext({ projectUuid, dataAppUuidOrSlug: 'app-1' }),
            { wrapper },
        );

        expect(result.current.isReady).toBe(false);
        expect(result.current.contextInput).toEqual([]);
        expect(result.current.previewItems).toEqual([]);
    });

    it('sorts a pinned dashboard before the data app', () => {
        useDashboardQueryMock.mockReturnValue({ data: dashboard });

        const { result } = renderHook(
            () =>
                usePinnedContext({
                    projectUuid,
                    dataAppUuidOrSlug: 'app-1',
                    dashboardUuidOrSlug: 'dashboard-1',
                }),
            { wrapper },
        );

        expect(result.current.contextInput.map((item) => item.type)).toEqual([
            'dashboard',
            'data_app',
        ]);
        expect(result.current.previewItems.map((item) => item.type)).toEqual([
            'dashboard',
            'data_app',
        ]);
    });

    it('pins the open Document by uuid, named from the page cache', () => {
        useGetAppMock.mockReturnValue({ data: undefined });
        queryClient.setQueryData(['document', projectUuid, 'q3-review'], {
            documentUuid: 'doc-1',
            slug: 'q3-review',
            name: 'Q3 review',
        });
        const { result } = renderHook(
            () => usePinnedContext({ projectUuid, documentUuid: 'doc-1' }),
            { wrapper },
        );

        expect(result.current.contextInput).toEqual([
            {
                type: 'document',
                documentUuid: 'doc-1',
                documentSlug: 'q3-review',
            },
        ]);
        expect(result.current.previewItems).toEqual([
            {
                type: 'document',
                documentUuid: 'doc-1',
                documentSlug: 'q3-review',
                displayName: 'Q3 review',
                pinnedVersionUuid: null,
            },
        ]);
        expect(result.current.isReady).toBe(true);
    });

    it('still pins a Document the page has not loaded, without fetching it', () => {
        useGetAppMock.mockReturnValue({ data: undefined });
        const { result } = renderHook(
            () => usePinnedContext({ projectUuid, documentUuid: 'doc-1' }),
            { wrapper },
        );

        expect(result.current.contextInput).toEqual([
            { type: 'document', documentUuid: 'doc-1', documentSlug: null },
        ]);
        expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    });
});
