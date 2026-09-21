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
import {
    CollectionBlockBuild,
    CollectionBlockView,
} from '../blocks/CollectionBlock';
import { useCollectionContent } from './useCollectionContent';
import { useCollectionSourceContent } from './useCollectionSourceContent';

const mocks = vi.hoisted(() => ({
    api: vi.fn(),
    toggle: vi.fn(),
    documentsEnabled: true,
}));
const favorites = [
    { type: ResourceViewItemType.DOCUMENT, data: { uuid: 'direct-document' } },
    { type: ResourceViewItemType.CHART, data: { uuid: 'chart' } },
];
const document = {
    contentType: ContentType.DOCUMENT,
    uuid: 'direct-document',
    name: 'Shared report',
    space: { uuid: 'space' },
    project: { uuid: 'project' },
    organization: { uuid: 'organization' },
};
const chart = { contentType: ContentType.CHART, uuid: 'chart', name: 'Orders' };
const config: HomepageCollectionBlock['config'] = {
    title: 'Favorites',
    source: 'favorites',
    items: [],
    layout: 'list',
};
vi.mock('../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: mocks.documentsEnabled } }),
}));
vi.mock('../../../../components/common/SpaceSelector/SpaceSelector', () => ({
    default: () => null,
}));
vi.mock('../../../../hooks/useSpaces', () => ({
    useSpaceSummaries: () => ({ data: [] }),
}));
vi.mock('../../../../hooks/useContent', () => ({
    useInfiniteContent: () => ({ data: { pages: [{ data: [document] }] } }),
}));
vi.mock('../../../../api', () => ({ lightdashApi: mocks.api }));
vi.mock('../../../../hooks/favorites/useFavorites', () => ({
    useFavorites: () => ({ data: favorites, isInitialLoading: false }),
}));
vi.mock('../../../../hooks/favorites/useFavoriteMutation', () => ({
    useFavoriteMutation: () => ({ mutate: mocks.toggle }),
}));
vi.mock('../../../../hooks/pinning/usePinnedItems', () => ({
    usePinnedItems: () => ({ data: favorites, isInitialLoading: false }),
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
        onRemove,
    }: {
        content: SummaryContent;
        onRemove?: () => void;
        star?: { isFavorite: boolean; onToggle: () => void };
    }) => (
        <div>
            {content.name}
            {onRemove && (
                <button onClick={onRemove}>Remove item {content.name}</button>
            )}
            {star && (
                <button onClick={star.onToggle}>
                    {star.isFavorite ? 'Remove' : 'Add'} {content.name}
                </button>
            )}
        </div>
    ),
}));

describe('Document collections', () => {
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
        mocks.documentsEnabled = true;
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

    it.each(['manual', 'pinned'] as const)(
        'resolves mixed %s Documents in reference order and omits inaccessible references',
        async (source) => {
            const { result } = renderHook(
                () =>
                    useCollectionSourceContent('project', {
                        title: 'Mixed',
                        source,
                        items: [
                            {
                                contentType: 'document',
                                uuid: 'direct-document',
                            },
                            {
                                contentType: 'document',
                                uuid: 'deleted-document',
                            },
                            { contentType: 'chart', uuid: 'chart' },
                        ],
                    }),
                { wrapper: wrapper() },
            );
            await waitFor(() => expect(result.current.isLoading).toBe(false));
            expect(result.current.items).toEqual([document, chart]);
            expect(mocks.api).toHaveBeenCalledTimes(2);
        },
    );

    it('filters a pinned collection to Documents after resolving mixed pins', async () => {
        const { result } = renderHook(
            () =>
                useCollectionSourceContent('project', {
                    title: 'Documents',
                    source: 'pinned',
                    items: [],
                    contentTypes: ['document'],
                }),
            { wrapper: wrapper() },
        );
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.items).toEqual([document]);
    });

    it('adds a Document through the picker and removes it with existing collection controls', async () => {
        const onChange = vi.fn();
        const block: HomepageCollectionBlock = {
            id: 'manual',
            type: 'collection',
            config: { title: 'Picked', items: [] },
        };
        const { rerender } = render(
            <CollectionBlockBuild
                block={block}
                projectUuid="project"
                itemSpan={null}
                onChange={onChange}
            />,
            { wrapper: wrapper() },
        );
        fireEvent.click(screen.getByRole('button', { name: 'Add content' }));
        fireEvent.click(screen.getByText('Documents'));
        fireEvent.click(await screen.findByText('Shared report'));
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
        const updatedBlock = {
            ...block,
            config: {
                ...block.config,
                items: [
                    {
                        contentType: 'document' as const,
                        uuid: 'direct-document',
                    },
                ],
            },
        };
        expect(onChange).toHaveBeenLastCalledWith(updatedBlock);
        rerender(
            <CollectionBlockBuild
                block={updatedBlock}
                projectUuid="project"
                itemSpan={null}
                onChange={onChange}
            />,
        );
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Remove item Shared report',
            }),
        );
        expect(onChange).toHaveBeenLastCalledWith(block);
    });

    it('hides the Document picker when Documents are disabled', () => {
        mocks.documentsEnabled = false;
        render(
            <CollectionBlockBuild
                block={{
                    id: 'manual',
                    type: 'collection',
                    config: { title: 'Picked', items: [] },
                }}
                projectUuid="project"
                itemSpan={null}
                onChange={vi.fn()}
            />,
            { wrapper: wrapper() },
        );
        fireEvent.click(screen.getByRole('button', { name: 'Add content' }));
        expect(screen.queryByText('Documents')).not.toBeInTheDocument();
    });

    it('imports Documents and charts from the pin list in their existing order', () => {
        const onChange = vi.fn();
        const block: HomepageCollectionBlock = {
            id: 'manual',
            type: 'collection',
            config: { title: 'Picked', items: [] },
        };
        render(
            <CollectionBlockBuild
                block={block}
                projectUuid="project"
                itemSpan={null}
                onChange={onChange}
            />,
            { wrapper: wrapper() },
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Import pinned items' }),
        );
        expect(onChange).toHaveBeenCalledWith({
            ...block,
            config: {
                ...block.config,
                items: [
                    { contentType: 'document', uuid: 'direct-document' },
                    { contentType: 'chart', uuid: 'chart' },
                ],
            },
        });
    });

    it('hides the Document type filter for dynamic collections when disabled', () => {
        mocks.documentsEnabled = false;
        render(
            <CollectionBlockBuild
                block={{
                    id: 'pinned',
                    type: 'collection',
                    config: { title: 'Pins', source: 'pinned', items: [] },
                }}
                projectUuid="project"
                itemSpan={null}
                onChange={vi.fn()}
            />,
            { wrapper: wrapper() },
        );
        expect(screen.queryByText('Documents')).not.toBeInTheDocument();
        expect(screen.getByText('Dashboards')).toBeInTheDocument();
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
