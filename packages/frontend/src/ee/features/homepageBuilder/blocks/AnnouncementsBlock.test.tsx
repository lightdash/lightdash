import {
    type HomepageBlock,
    type ProjectAnnouncement,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    scheduledPublishAt: null,
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

const renderView = (blockOverride: HomepageBlock = block) =>
    render(
        <MantineProvider env="test">
            <AnnouncementsBlockView
                block={blockOverride}
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

const collapsedBlock: HomepageBlock = {
    ...block,
    type: 'announcements',
    config: { title: 'From the data team', collapseAfterFirst: true },
};

const laterAnnouncements = (count: number): ProjectAnnouncement[] =>
    Array.from({ length: count }, (_, index) => ({
        ...announcement,
        announcementUuid: `ann-${index + 2}`,
        title: `Announcement ${index + 2}`,
    }));

// Seven unpinned announcements: two past RECENT_LIMIT, so the default mode
// tucks a tail behind the "earlier announcements" toggle while the collapsed
// mode puts all six non-lead ones there. Fewer and the modes converge.
const sevenAnnouncements = [announcement, ...laterAnnouncements(6)];

it('puts every announcement but the lead behind one toggle when configured', () => {
    mockCan.mockReturnValue(true);
    mockUseAnnouncements.mockReturnValue(feed(sevenAnnouncements));
    renderView(collapsedBlock);
    // One lead card, and the whole tail collapsed behind a single toggle.
    expect(screen.getAllByLabelText('Edit announcement')).toHaveLength(1);
    expect(screen.getByText('Orders explore refreshed')).toBeInTheDocument();
    expect(screen.getByText(/6 earlier announcements/)).toBeInTheDocument();
    expect(screen.queryByText('Announcement 2')).not.toBeInTheDocument();
    expect(screen.queryByText('Announcement 7')).not.toBeInTheDocument();
});

it('reveals the whole tail when the collapsed toggle is opened', async () => {
    mockCan.mockReturnValue(true);
    mockUseAnnouncements.mockReturnValue(feed(sevenAnnouncements));
    renderView(collapsedBlock);
    await userEvent.click(screen.getByText(/6 earlier announcements/));
    // Every one of the six, not a capped subset.
    expect(screen.getByText('Announcement 2')).toBeInTheDocument();
    expect(screen.getByText('Announcement 7')).toBeInTheDocument();
    expect(screen.getByText(/Show fewer/)).toBeInTheDocument();
});

it('expands up to RECENT_LIMIT cards and defers the tail by default', () => {
    mockCan.mockReturnValue(true);
    mockUseAnnouncements.mockReturnValue(feed(sevenAnnouncements));
    renderView();
    expect(screen.getAllByLabelText('Edit announcement')).toHaveLength(5);
    expect(screen.getByText(/2 earlier announcements/)).toBeInTheDocument();
    expect(screen.queryByText('Announcement 7')).not.toBeInTheDocument();
});

it('leads with the pinned announcement when collapsed', () => {
    mockCan.mockReturnValue(true);
    const [second, third] = laterAnnouncements(2);
    mockUseAnnouncements.mockReturnValue(
        feed([announcement, second, { ...third, pinned: true }]),
    );
    renderView(collapsedBlock);
    // The pinned one leads as the card even though it is not the newest.
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    expect(screen.getByText('Announcement 3')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Edit announcement')).toHaveLength(1);
});
