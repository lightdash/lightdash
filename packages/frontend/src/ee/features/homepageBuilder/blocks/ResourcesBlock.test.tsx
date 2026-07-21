import { type HomepageResourcesBlock } from '@lightdash/common';
import { MantineProvider } from '@mantine-8/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fetchHomepageLinkMetadata } from '../hooks/useHomepageLinkMetadata';
import { ResourcesBlockBuild, ResourcesBlockView } from './ResourcesBlock';
import { resolveResourceUrl } from './resourceUrls';

vi.mock('../hooks/useHomepageLinkMetadata', () => ({
    fetchHomepageLinkMetadata: vi.fn(),
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
