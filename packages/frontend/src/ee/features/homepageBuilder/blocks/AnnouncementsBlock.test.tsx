import {
    type HomepageBlock,
    type ProjectAnnouncement,
} from '@lightdash/common';
import { MantineProvider } from '@mantine-8/core';
import { render, screen } from '@testing-library/react';
import { AnnouncementsBlockView } from './AnnouncementsBlock';

const mockCan = vi.fn();
vi.mock('../../../../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: { organizationUuid: 'org-1', ability: { can: mockCan } },
        },
    }),
}));

const mockUseAnnouncements = vi.fn();
vi.mock('../hooks/useAnnouncements', () => ({
    useAnnouncements: (...args: unknown[]) => mockUseAnnouncements(...args),
    useCreateAnnouncement: () => ({ mutate: vi.fn(), isLoading: false }),
    useUpdateAnnouncement: () => ({ mutate: vi.fn(), isLoading: false }),
    useDeleteAnnouncement: () => ({ mutate: vi.fn(), isLoading: false }),
    useUploadAnnouncementImage: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('../../../../hooks/slack/useSlack', () => ({
    useGetSlack: () => ({ data: undefined }),
}));

const block: HomepageBlock = {
    id: 'b1',
    type: 'announcements',
    config: { title: 'From the data team' },
};

const announcement: ProjectAnnouncement = {
    announcementUuid: 'ann-1',
    projectUuid: 'p1',
    title: 'Orders explore refreshed',
    body: null,
    category: null,
    pinned: false,
    published: true,
    pendingSlackChannelId: null,
    createdByUserUuid: 'u1',
    authorName: 'Ana',
    createdAt: new Date(),
    updatedAt: new Date(),
};

const feed = (items: ProjectAnnouncement[]) => ({
    data: { items, totalCount: items.length },
    isInitialLoading: false,
    isError: false,
});

const renderView = () =>
    render(
        <MantineProvider env="test">
            <AnnouncementsBlockView
                block={block}
                projectUuid="p1"
                itemSpan={null}
                standalone
            />
        </MantineProvider>,
    );

it('renders nothing for a viewer when the feed is empty', () => {
    mockCan.mockReturnValue(false);
    mockUseAnnouncements.mockReturnValue(feed([]));
    renderView();
    expect(screen.queryByText('From the data team')).not.toBeInTheDocument();
    expect(screen.queryByText('New announcement')).not.toBeInTheDocument();
});

it('shows the feed without admin actions for a viewer', () => {
    mockCan.mockReturnValue(false);
    mockUseAnnouncements.mockReturnValue(feed([announcement]));
    renderView();
    expect(screen.getByText('Orders explore refreshed')).toBeInTheDocument();
    expect(screen.queryByText('New announcement')).not.toBeInTheDocument();
    expect(
        screen.queryByLabelText('Edit announcement'),
    ).not.toBeInTheDocument();
    expect(mockUseAnnouncements).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ includeUnpublished: false }),
    );
});

it('keeps the create entry point for a manager on an empty feed', () => {
    mockCan.mockReturnValue(true);
    mockUseAnnouncements.mockReturnValue(feed([]));
    renderView();
    expect(screen.getByText('New announcement')).toBeInTheDocument();
    expect(screen.getByText(/share your first update/)).toBeInTheDocument();
});

it('shows admin actions and drafts for a manager', () => {
    mockCan.mockReturnValue(true);
    mockUseAnnouncements.mockReturnValue(feed([announcement]));
    renderView();
    expect(screen.getByText('New announcement')).toBeInTheDocument();
    expect(screen.getByLabelText('Edit announcement')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete announcement')).toBeInTheDocument();
    expect(mockUseAnnouncements).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ includeUnpublished: true }),
    );
});
