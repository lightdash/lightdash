import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import useEmbed from '../../../ee/providers/Embed/useEmbed';
import { useDataAppVisualizations } from './useDataAppVisualizations';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../../ee/providers/Embed/useEmbed', () => ({
    default: vi.fn(() => ({})),
}));

const createWrapper = () => {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false, notifyOnChangeProps: 'all' },
        },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
};

describe('useDataAppVisualizations', () => {
    beforeEach(() => {
        vi.mocked(lightdashApi).mockReset();
        vi.mocked(useEmbed).mockReturnValue({} as ReturnType<typeof useEmbed>);
    });

    it.each([false, true])(
        'preserves search, sort and pagination (embedded: %s)',
        async (isEmbedded) => {
            vi.mocked(useEmbed).mockReturnValue({
                embedToken: isEmbedded ? 'embed-token' : undefined,
            } as ReturnType<typeof useEmbed>);
            vi.mocked(lightdashApi).mockResolvedValue({
                data: [],
                pagination: {
                    page: 1,
                    pageSize: 6,
                    totalPageCount: 2,
                    totalResults: 7,
                },
            });
            const { result } = renderHook(
                () =>
                    useDataAppVisualizations(
                        'project-1',
                        'bar & line',
                        { sortBy: 'name', sortDirection: 'asc' },
                        6,
                    ),
                { wrapper: createWrapper() },
            );
            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            const baseUrl = isEmbedded
                ? '/embed/project-1/visualizations'
                : '/ee/projects/project-1/apps/visualizations';
            expect(lightdashApi).toHaveBeenLastCalledWith({
                method: 'GET',
                url: `${baseUrl}?page=1&pageSize=6&sortBy=name&sortDirection=asc&search=bar+%26+line`,
                body: undefined,
            });
            await act(async () => {
                await result.current.fetchNextPage();
            });
            expect(lightdashApi).toHaveBeenLastCalledWith({
                method: 'GET',
                url: `${baseUrl}?page=2&pageSize=6&sortBy=name&sortDirection=asc&search=bar+%26+line`,
                body: undefined,
            });
            await waitFor(() => expect(result.current.hasNextPage).toBe(false));
        },
    );

    it('does not fetch without a project', () => {
        renderHook(() => useDataAppVisualizations(undefined), {
            wrapper: createWrapper(),
        });
        expect(lightdashApi).not.toHaveBeenCalled();
    });
});
