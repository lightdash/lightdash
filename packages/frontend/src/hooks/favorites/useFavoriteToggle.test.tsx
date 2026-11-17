import { ContentType, ResourceViewItemType } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { useFavoriteToggle } from './useFavoriteToggle';

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../api');
vi.mock('../toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: mocks.success,
        showToastApiError: mocks.error,
    }),
}));

const dashboard = {
    type: ResourceViewItemType.DASHBOARD,
    data: { uuid: 'dashboard', name: 'Sales' },
};

describe('useFavoriteToggle', () => {
    let client: QueryClient;
    let isFavoriteOnServer: boolean;
    let finishToggle: () => void;
    let failToggle: () => void;
    let finishRefresh: (() => void) | undefined;
    let holdRefresh: boolean;

    beforeEach(() => {
        client = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        isFavoriteOnServer = false;
        holdRefresh = false;
        finishRefresh = undefined;
        mocks.success.mockReset();
        mocks.error.mockReset();
        mockedLightdashApi
            .mockReset()
            .mockImplementation(({ method }: { method: string }) => {
                if (method === 'GET') {
                    const list = isFavoriteOnServer ? [dashboard] : [];
                    if (!holdRefresh) return Promise.resolve(list);
                    return new Promise((resolve) => {
                        finishRefresh = () => resolve(list);
                    });
                }
                return new Promise((resolve, reject) => {
                    finishToggle = () => {
                        isFavoriteOnServer = !isFavoriteOnServer;
                        resolve({ isFavorite: isFavoriteOnServer });
                    };
                    failToggle = () =>
                        reject({
                            error: { message: 'Unavailable', statusCode: 500 },
                        });
                });
            });
    });
    afterEach(() => client.clear());

    const render = () =>
        renderHook(() => useFavoriteToggle('project'), {
            wrapper: ({ children }: PropsWithChildren) => (
                <QueryClientProvider client={client}>
                    {children}
                </QueryClientProvider>
            ),
        });
    const patchCount = () =>
        mockedLightdashApi.mock.calls.filter(([r]) => r.method === 'PATCH')
            .length;
    const click = (result: ReturnType<typeof render>['result']) =>
        act(() => result.current.toggle(ContentType.DASHBOARD, 'dashboard'));

    it('reflects a click before the request resolves and drops a second click', async () => {
        const { result } = render();
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.isFavorite('dashboard')).toBe(false);

        click(result);
        await waitFor(() =>
            expect(result.current.isFavorite('dashboard')).toBe(true),
        );
        expect(result.current.isPending('dashboard')).toBe(true);
        click(result);
        expect(patchCount()).toBe(1);
        expect(mockedLightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'PATCH',
                body: JSON.stringify({
                    contentType: 'dashboard',
                    contentUuid: 'dashboard',
                }),
            }),
        );

        // Still favorited while the list refetch is in flight
        holdRefresh = true;
        await act(async () => finishToggle());
        await waitFor(() => expect(finishRefresh).toBeDefined());
        expect(result.current.isFavorite('dashboard')).toBe(true);
        expect(result.current.isPending('dashboard')).toBe(true);

        await act(async () => finishRefresh!());
        await waitFor(() =>
            expect(result.current.isPending('dashboard')).toBe(false),
        );
        expect(result.current.isFavorite('dashboard')).toBe(true);

        holdRefresh = false;
        click(result);
        await waitFor(() =>
            expect(result.current.isFavorite('dashboard')).toBe(false),
        );
        expect(patchCount()).toBe(2);
    });

    it('restores the previous state with an error toast when the request fails', async () => {
        isFavoriteOnServer = true;
        const { result } = render();
        await waitFor(() =>
            expect(result.current.isFavorite('dashboard')).toBe(true),
        );

        click(result);
        await waitFor(() =>
            expect(result.current.isFavorite('dashboard')).toBe(false),
        );
        await act(async () => failToggle());
        await waitFor(() =>
            expect(result.current.isFavorite('dashboard')).toBe(true),
        );
        expect(result.current.isPending('dashboard')).toBe(false);
        expect(mocks.error).toHaveBeenCalled();
    });

    it('ignores clicks until the favorites list has loaded', () => {
        holdRefresh = true;
        const { result } = render();
        expect(result.current.isLoading).toBe(true);
        click(result);
        expect(patchCount()).toBe(0);
    });
});
