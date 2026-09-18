import {
    ContentType,
    ResourceViewItemType,
    type HomepageCollectionBlock,
    type SummaryContent,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    fireEvent,
    render,
    renderHook,
    screen,
    waitFor,
} from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { CollectionBlockView } from '../blocks/CollectionBlock';
import { useCollectionContent } from './useCollectionContent';
import { useCollectionSourceContent } from './useCollectionSourceContent';

const mocks = vi.hoisted(() => ({ api: vi.fn(), toggle: vi.fn() }));
const favorites = [
    { type: ResourceViewItemType.DOCUMENT, data: { uuid: 'direct-document' } },
    { type: ResourceViewItemType.CHART, data: { uuid: 'chart' } },
];
const document = {
    contentType: ContentType.DOCUMENT,
    uuid: 'direct-document',
    name: 'Shared report',
};
const chart = { contentType: ContentType.CHART, uuid: 'chart', name: 'Orders' };
const config: HomepageCollectionBlock['config'] = {
    title: 'Favorites',
    source: 'favorites',
    items: [],
    layout: 'list',
};
vi.mock('../../../../api', () => ({ lightdashApi: mocks.api }));
vi.mock('../../../../hooks/favorites/useFavorites', () => ({
    useFavorites: () => ({ data: favorites, isInitialLoading: false }),
}));
vi.mock('../../../../hooks/favorites/useFavoriteMutation', () => ({
    useFavoriteMutation: () => ({ mutate: mocks.toggle }),
}));
vi.mock('../../../../hooks/pinning/usePinnedItems', () => ({
    usePinnedItems: () => ({ isInitialLoading: false }),
}));
vi.mock('../../../../hooks/useProject', () => ({
    useMostPopularAndRecentlyUpdated: () => ({ isInitialLoading: false }),
    useProject: () => ({}),
}));
vi.mock('../../../../hooks/useVerifiedContentList', () => ({
    useVerifiedContentForHomepage: () => ({ isInitialLoading: false }),
}));
vi.mock('./useRecentContents', () => ({
    useRecentContents: () => ({ contents: [], isLoading: false }),
}));
vi.mock('../blocks/ContentCard', () => ({
    ContentCard: ({
        content,
        star,
    }: {
        content: SummaryContent;
        star?: { isFavorite: boolean; onToggle: () => void };
    }) => (
        <div>
            {content.name}
            {star && (
                <button onClick={star.onToggle}>
                    {star.isFavorite ? 'Remove' : 'Add'} {content.name}
                </button>
            )}
        </div>
    ),
}));

describe('Document favorites collection', () => {
    const clients: QueryClient[] = [];
    const wrapper = () => {
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        clients.push(client);
        return ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={client}>
                <MantineProvider env="test">{children}</MantineProvider>
            </QueryClientProvider>
        );
    };
    beforeEach(() => {
        mocks.toggle.mockReset();
        mocks.api.mockReset();
        mocks.api.mockImplementation(async ({ url }: { url: string }) => ({
            data:
                new URL(url, 'http://test').searchParams.get('contentTypes') ===
                'document'
                    ? [document]
                    : [chart],
        }));
    });
    afterEach(() => clients.forEach((client) => client.clear()));

    it('resolves direct-only Documents through the document-scoped endpoint and preserves favorites order', async () => {
        const { result } = renderHook(
            () => useCollectionSourceContent('project', config),
            { wrapper: wrapper() },
        );
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.items).toEqual([document, chart]);
        expect(mocks.api).toHaveBeenCalledTimes(2);
        expect(mocks.api).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/content?projectUuids=project&uuids=direct-document&contentTypes=document&pageSize=10',
            }),
        );
        expect(mocks.api).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/content?projectUuids=project&uuids=chart&pageSize=10',
            }),
        );
    });

    it('offers removal for a directly shared Document in the existing favorites collection', async () => {
        render(
            <CollectionBlockView
                block={{ id: 'favorites', type: 'collection', config }}
                projectUuid="project"
                itemSpan={null}
            />,
            { wrapper: wrapper() },
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Remove Shared report' }),
        );
        expect(mocks.toggle).toHaveBeenCalledWith({
            contentType: ResourceViewItemType.DOCUMENT,
            contentUuid: 'direct-document',
        });
    });

    it('omits Documents removed by server-side access filtering', async () => {
        mocks.api.mockResolvedValue({ data: [chart] });
        const { result } = renderHook(
            () => useCollectionSourceContent('project', config),
            { wrapper: wrapper() },
        );
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.items).toEqual([chart]);
    });

    it('leaves manual collection queries unscoped', async () => {
        const { result } = renderHook(
            () =>
                useCollectionSourceContent('project', {
                    title: 'Picked',
                    items: [{ contentType: ContentType.CHART, uuid: 'chart' }],
                }),
            { wrapper: wrapper() },
        );
        await waitFor(() => expect(result.current.items).toEqual([chart]));
        expect(mocks.api).toHaveBeenCalledTimes(1);
        expect(mocks.api).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/content?projectUuids=project&uuids=chart&pageSize=10',
            }),
        );
    });

    it('keeps scoped results out of the generic collection cache', async () => {
        const { result } = renderHook(
            () => ({
                generic: useCollectionContent('project', ['direct-document']),
                scoped: useCollectionContent(
                    'project',
                    ['direct-document'],
                    [ContentType.DOCUMENT],
                ),
            }),
            { wrapper: wrapper() },
        );
        await waitFor(() =>
            expect(result.current.scoped.data).toEqual([document]),
        );
        await waitFor(() => expect(result.current.generic.data).toEqual([]));
        expect(mocks.api).toHaveBeenCalledTimes(2);
    });
});
