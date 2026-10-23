import { ContentType, ResourceViewItemType } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { useFavoriteMutation } from './useFavoriteMutation';
import { useFavorites } from './useFavorites';

const mocks = vi.hoisted(() => ({
    api: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
}));
vi.mock('../../api');
vi.mock('../toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: mocks.success,
        showToastApiError: mocks.error,
    }),
}));

const document = {
    type: ResourceViewItemType.DOCUMENT,
    data: { uuid: 'document', name: 'Report', slug: 'report' },
};

describe('Document favorites', () => {
    const clients: QueryClient[] = [];
    beforeEach(() => {
        mockedLightdashApi.mockReset();
        mocks.success.mockReset();
        mocks.error.mockReset();
    });
    afterEach(() => clients.forEach((client) => client.clear()));
    const wrapper = () => {
        const client = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        clients.push(client);
        return ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
    };
    it('refreshes the shared favorite state after adding and removing a document', async () => {
        mockedLightdashApi
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce({ isFavorite: true })
            .mockResolvedValueOnce([document])
            .mockResolvedValueOnce({ isFavorite: false })
            .mockResolvedValueOnce([]);
        const { result } = renderHook(
            () => ({
                favorites: useFavorites('project'),
                toggle: useFavoriteMutation('project'),
            }),
            { wrapper: wrapper() },
        );
        await waitFor(() => expect(result.current.favorites.data).toEqual([]));
        act(() =>
            result.current.toggle.mutate({
                contentType: ContentType.DOCUMENT,
                contentUuid: 'document',
            }),
        );
        await waitFor(() =>
            expect(result.current.favorites.data).toEqual([document]),
        );
        expect(mockedLightdashApi).toHaveBeenCalledWith({
            url: '/projects/project/favorites',
            method: 'PATCH',
            body: JSON.stringify({
                contentType: 'document',
                contentUuid: 'document',
            }),
        });
        act(() =>
            result.current.toggle.mutate({
                contentType: ContentType.DOCUMENT,
                contentUuid: 'document',
            }),
        );
        await waitFor(() => expect(result.current.favorites.data).toEqual([]));
        expect(mocks.success).toHaveBeenLastCalledWith({
            title: 'Removed from favorites',
        });
    });
    it('retains existing favorite state and surfaces failed mutations', async () => {
        mockedLightdashApi
            .mockResolvedValueOnce([document])
            .mockRejectedValueOnce({
                error: { message: 'Document unavailable', statusCode: 404 },
            });
        const { result } = renderHook(
            () => ({
                favorites: useFavorites('project'),
                toggle: useFavoriteMutation('project'),
            }),
            { wrapper: wrapper() },
        );
        await waitFor(() =>
            expect(result.current.favorites.data).toEqual([document]),
        );
        act(() =>
            result.current.toggle.mutate({
                contentType: ContentType.DOCUMENT,
                contentUuid: 'document',
            }),
        );
        await waitFor(() => expect(mocks.error).toHaveBeenCalled());
        expect(result.current.favorites.data).toEqual([document]);
        expect(mocks.success).not.toHaveBeenCalled();
    });
});
