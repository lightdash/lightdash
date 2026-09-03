import { renderHook } from '@testing-library/react';
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
            const { result } = renderHook(() =>
                usePinnedContext({ projectUuid, dataAppUuidOrSlug }),
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

        const { result } = renderHook(() =>
            usePinnedContext({ projectUuid, dataAppUuidOrSlug: 'app-1' }),
        );

        expect(result.current.isReady).toBe(false);
        expect(result.current.contextInput).toEqual([]);
        expect(result.current.previewItems).toEqual([]);
    });

    it('sorts a pinned dashboard before the data app', () => {
        useDashboardQueryMock.mockReturnValue({ data: dashboard });

        const { result } = renderHook(() =>
            usePinnedContext({
                projectUuid,
                dataAppUuidOrSlug: 'app-1',
                dashboardUuidOrSlug: 'dashboard-1',
            }),
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
});
