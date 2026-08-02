import { type HomepageResourcesBlock } from '@lightdash/common';
import { MantineProvider } from '@mantine-8/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fetchHomepageLinkMetadata } from '../hooks/useHomepageLinkMetadata';
import { ResourcesBlockBuild, ResourcesBlockView } from './ResourcesBlock';
import { resolveResourceUrl } from './resourceUrls';

vi.mock('../hooks/useHomepageLinkMetadata', () => ({
    fetchHomepageLinkMetadata: vi.fn(),
}));

const { thumbnailState } = vi.hoisted(() => ({
    thumbnailState: {
        current: { data: null } as {
            data: { thumbnailUrl: string } | null;
        },
    },
}));

vi.mock('../../../../features/apps/hooks/useAppThumbnail', () => ({
    useAppThumbnailUrl: () => thumbnailState.current,
}));

const mockFetch = vi.mocked(fetchHomepageLinkMetadata);

const wrap = (ui: React.ReactNode) =>
    render(<MantineProvider>{ui}</MantineProvider>);

const block = (
    config: Partial<HomepageResourcesBlock['config']>,
): HomepageResourcesBlock => ({
    id: 'b1',
    type: 'resources',
    config: { title: 'Getting started', items: [], ...config },
});

const claudeItem = {
    url: 'https://claude.ai/public/artifacts/abc',
    kind: 'claude' as const,
    title: 'Palette Lab',
    description: 'Generate color palettes',
    imageUrl: 'https://claude.ai/images/claude_ogimage.png',
};

describe('ResourcesBlockView', () => {
    it('renders a card with title, description and a link to the resource', () => {
        wrap(
            <ResourcesBlockView
                itemSpan={null}
                projectUuid="p1"
                block={block({ layout: 'card', items: [claudeItem] })}
            />,
        );
        expect(screen.getByText('Palette Lab')).toBeInTheDocument();
        expect(screen.getByText('Generate color palettes')).toBeInTheDocument();
        expect(screen.getByRole('link')).toHaveAttribute(
            'href',
            claudeItem.url,
        );
    });

    it('renders a compact row in list layout', () => {
        wrap(
            <ResourcesBlockView
                itemSpan={null}
                projectUuid="p1"
                block={block({ layout: 'list', items: [claudeItem] })}
            />,
        );
        expect(screen.getByText('Palette Lab')).toBeInTheDocument();
        expect(screen.getByRole('link')).toHaveAttribute(
            'href',
            claudeItem.url,
        );
    });

    it('derives a data app href from appUuid, ignoring the stored url', () => {
        const dataAppItem = {
            url: '/projects/p1/nabc-123', // malformed url persisted by an old builder version
            kind: 'data-app' as const,
            title: 'My App',
            appUuid: 'abc-123',
        };
        wrap(
            <ResourcesBlockView
                itemSpan={null}
                projectUuid="p1"
                block={block({ layout: 'list', items: [dataAppItem] })}
            />,
        );
        expect(screen.getByRole('link')).toHaveAttribute(
            'href',
            '/projects/p1/apps/abc-123/view',
        );
    });

    describe('data app thumbnails', () => {
        const dataAppItem = {
            url: '/projects/p1/napp-1',
            kind: 'data-app' as const,
            title: 'Orders KPI Snapshot',
            description: 'Daily orders and revenue',
            appUuid: 'app-1',
        };

        afterEach(() => {
            thumbnailState.current = { data: null };
        });

        const withThumbnail = (thumbnailUrl: string | undefined) => {
            thumbnailState.current = {
                data: thumbnailUrl ? { thumbnailUrl } : null,
            };
        };

        it('shows the screenshot when the app has one', () => {
            withThumbnail('https://example.invalid/shot.png');
            wrap(
                <ResourcesBlockView
                    itemSpan={null}
                    projectUuid="p1"
                    block={block({ layout: 'card', items: [dataAppItem] })}
                />,
            );
            expect(screen.getByRole('img')).toHaveAttribute(
                'src',
                'https://example.invalid/shot.png',
            );
        });

        it('falls back to an icon rather than an image when there is no screenshot', () => {
            withThumbnail(undefined);
            wrap(
                <ResourcesBlockView
                    itemSpan={null}
                    projectUuid="p1"
                    block={block({ layout: 'card', items: [dataAppItem] })}
                />,
            );
            expect(screen.queryByRole('img')).not.toBeInTheDocument();
            expect(screen.getByText('Orders KPI Snapshot')).toBeInTheDocument();
        });

        it('falls back to an icon in list layout too', () => {
            withThumbnail(undefined);
            wrap(
                <ResourcesBlockView
                    itemSpan={null}
                    projectUuid="p1"
                    block={block({ layout: 'list', items: [dataAppItem] })}
                />,
            );
            expect(screen.queryByRole('img')).not.toBeInTheDocument();
        });
    });

    describe('list layout scan hierarchy', () => {
        it('carries kind in the leading glyph, not a trailing pill', () => {
            wrap(
                <ResourcesBlockView
                    itemSpan={null}
                    projectUuid="p1"
                    block={block({
                        layout: 'list',
                        items: [
                            {
                                url: 'https://example.com/handbook',
                                kind: 'doc' as const,
                                title: 'How we define revenue',
                                description: 'Metric definitions',
                            },
                        ],
                    })}
                />,
            );
            expect(
                screen.getByText('How we define revenue'),
            ).toBeInTheDocument();
            // The pill repeated what the glyph already says, from the far edge.
            expect(screen.queryByText('Doc')).not.toBeInTheDocument();
        });

        it('uses one monochrome glyph family — no hero images, no brand favicons', () => {
            wrap(
                <ResourcesBlockView
                    itemSpan={null}
                    projectUuid="p1"
                    block={block({
                        layout: 'list',
                        items: [
                            {
                                url: 'https://www.youtube.com/watch?v=abc',
                                kind: 'youtube' as const,
                                title: 'Reading the funnel report',
                                imageUrl: 'https://i.ytimg.com/vi/abc/hq.jpg',
                            },
                            {
                                url: 'https://example.com/handbook',
                                kind: 'doc' as const,
                                title: 'How we define revenue',
                            },
                        ],
                    })}
                />,
            );
            // A cropped 16:9 still is a smudge at 34px, and a saturated brand
            // favicon is a hotspot in a row of grey glyphs. Every row gets the
            // same neutral square instead.
            expect(screen.queryAllByRole('img')).toHaveLength(0);
        });

        it('still shows a hero image in the card layout', () => {
            wrap(
                <ResourcesBlockView
                    itemSpan={null}
                    projectUuid="p1"
                    block={block({
                        layout: 'card',
                        items: [
                            {
                                url: 'https://www.youtube.com/watch?v=abc',
                                kind: 'youtube' as const,
                                title: 'Reading the funnel report',
                                imageUrl: 'https://i.ytimg.com/vi/abc/hq.jpg',
                            },
                        ],
                    })}
                />,
            );
            expect(screen.getByRole('img')).toHaveAttribute(
                'src',
                'https://i.ytimg.com/vi/abc/hq.jpg',
            );
        });
    });

    it('renders nothing when there are no items', () => {
        wrap(
            <ResourcesBlockView
                itemSpan={null}
                projectUuid="p1"
                block={block({ items: [] })}
            />,
        );
        expect(screen.queryByRole('link')).toBeNull();
        expect(screen.queryByText('Getting started')).toBeNull();
    });
});

describe('ResourcesBlockBuild smart paste', () => {
    beforeEach(() => mockFetch.mockReset());

    it('resolves an allowlisted URL into a fully-populated item', async () => {
        mockFetch.mockResolvedValue({
            kind: 'claude',
            title: 'Palette Lab',
            description: 'Generate color palettes',
            imageUrl: 'https://claude.ai/images/claude_ogimage.png',
        });
        const onChange = vi.fn();
        wrap(
            <ResourcesBlockBuild
                itemSpan={null}
                projectUuid="p1"
                onChange={onChange}
                block={block({ layout: 'card', items: [] })}
            />,
        );

        fireEvent.change(
            screen.getByPlaceholderText(/Paste a Claude artifact/i),
            { target: { value: claudeItem.url } },
        );
        fireEvent.click(screen.getByLabelText('Add resource'));

        await waitFor(() => expect(onChange).toHaveBeenCalled());
        const committed = onChange.mock.calls.at(-1)![0];
        expect(committed.config.items).toEqual([claudeItem]);
    });

    it('falls back to a plain link when the host is not allowlisted', async () => {
        mockFetch.mockRejectedValueOnce(new Error('400'));
        await expect(
            resolveResourceUrl('p1', 'https://example.com/handbook'),
        ).resolves.toEqual({
            url: 'https://example.com/handbook',
            kind: 'link',
            title: 'example.com',
        });
    });

    it('ignores non-URL words when pasting prose around a link', async () => {
        mockFetch.mockResolvedValue({
            kind: 'claude',
            title: 'Palette Lab',
            description: null,
            imageUrl: null,
        });
        const onChange = vi.fn();
        wrap(
            <ResourcesBlockBuild
                itemSpan={null}
                projectUuid="p1"
                onChange={onChange}
                block={block({ layout: 'card', items: [] })}
            />,
        );

        fireEvent.change(
            screen.getByPlaceholderText(/Paste a Claude artifact/i),
            { target: { value: `Check this out: ${claudeItem.url}` } },
        );
        fireEvent.click(screen.getByLabelText('Add resource'));

        await waitFor(() => expect(onChange).toHaveBeenCalled());
        const committed = onChange.mock.calls.at(-1)![0];
        // Only the URL becomes a resource; "Check", "this", "out:" are dropped.
        expect(committed.config.items).toHaveLength(1);
        expect(committed.config.items[0].url).toBe(claudeItem.url);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('adds https:// to a bare host before resolving', async () => {
        mockFetch.mockResolvedValueOnce({
            kind: 'youtube',
            title: 'Clip',
            description: 'Channel',
            imageUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
        });
        await resolveResourceUrl('p1', 'youtube.com/watch?v=x');
        expect(mockFetch).toHaveBeenCalledWith(
            'p1',
            'https://youtube.com/watch?v=x',
        );
    });
});
