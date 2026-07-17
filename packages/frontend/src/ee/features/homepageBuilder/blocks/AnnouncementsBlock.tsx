import {
    type AnnouncementCategory,
    type ProjectAnnouncement,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Drawer,
    Group,
    Select,
    Stack,
    Text,
    Textarea,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import {
    IconPencil,
    IconPin,
    IconPinnedOff,
    IconSpeakerphone,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import {
    useAnnouncementCategories,
    useAnnouncements,
    useCreateAnnouncement,
    useDeleteAnnouncement,
    useUpdateAnnouncement,
} from '../hooks/useAnnouncements';
import { AnnouncementComposer } from './announcements/AnnouncementComposer';
import { AnnouncementContent } from './announcements/AnnouncementContent';
import classes from './announcements/announcements.module.css';
import { BlockHeader } from './BlockShell';
import blockClasses from './blockStyles.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const BRIEFS_COUNT = 4;
const FEED_PAGE_SIZE = 25;
const ARCHIVE_PAGE_SIZE = 10;

// The composer emits one markdown text; newspaper semantics: the first line
// is the headline, the rest is the body.
const splitHeadline = (
    markdown: string,
): { title: string; body: string | null } => {
    const [firstLine, ...rest] = markdown.split('\n');
    const title = firstLine.replace(/^#+\s*/, '').trim();
    const body = rest.join('\n').trim();
    return { title, body: body.length > 0 ? body : null };
};

const CategoryBadge: FC<{ category: AnnouncementCategory | undefined }> = ({
    category,
}) =>
    category ? (
        <Badge variant="light" color={category.color} size="sm" radius="sm">
            {category.name}
        </Badge>
    ) : null;

const Timestamp: FC<{ announcement: ProjectAnnouncement }> = ({
    announcement,
}) => {
    const timeAgo = useTimeAgo(new Date(announcement.createdAt));
    return (
        <>
            {timeAgo}
            {announcement.authorName ? ` · ${announcement.authorName}` : ''}
        </>
    );
};

type FeedItem = {
    announcement: ProjectAnnouncement;
    category: AnnouncementCategory | undefined;
};

const useAnnouncementFeed = (
    projectUuid: string,
    categoryUuids: string[],
): { items: FeedItem[]; totalCount: number } => {
    const singleCategory =
        categoryUuids.length === 1 ? categoryUuids[0] : undefined;
    const { data } = useAnnouncements(projectUuid, {
        page: 1,
        pageSize: FEED_PAGE_SIZE,
        categoryUuid: singleCategory,
    });
    const { data: categories } = useAnnouncementCategories(projectUuid);
    return useMemo(() => {
        const byUuid = new Map(
            (categories ?? []).map((category) => [
                category.categoryUuid,
                category,
            ]),
        );
        const wanted = new Set(categoryUuids);
        const items = (data?.items ?? [])
            .filter(
                (announcement) =>
                    wanted.size <= 1 ||
                    (announcement.categoryUuid !== null &&
                        wanted.has(announcement.categoryUuid)),
            )
            .map((announcement) => ({
                announcement,
                category: announcement.categoryUuid
                    ? byUuid.get(announcement.categoryUuid)
                    : undefined,
            }));
        return {
            items,
            // Multi-category filtering happens client-side within the first
            // page, so the server total does not apply.
            totalCount:
                categoryUuids.length > 1
                    ? items.length
                    : (data?.totalCount ?? 0),
        };
    }, [data, categories, categoryUuids]);
};

const ArchiveDrawer: FC<{
    projectUuid: string;
    opened: boolean;
    onClose: () => void;
}> = ({ projectUuid, opened, onClose }) => {
    const [page, setPage] = useState(1);
    const [categoryUuid, setCategoryUuid] = useState<string | undefined>(
        undefined,
    );
    const { data } = useAnnouncements(projectUuid, {
        page,
        pageSize: ARCHIVE_PAGE_SIZE,
        categoryUuid,
    });
    const { data: categories } = useAnnouncementCategories(projectUuid);
    const byUuid = new Map(
        (categories ?? []).map((category) => [category.categoryUuid, category]),
    );
    const totalPages = Math.max(
        1,
        Math.ceil((data?.totalCount ?? 0) / ARCHIVE_PAGE_SIZE),
    );
    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            position="right"
            size="md"
            title="All announcements"
        >
            <Group gap={6} mb="sm" wrap="wrap">
                <Button
                    size="compact-xs"
                    variant={categoryUuid === undefined ? 'filled' : 'default'}
                    onClick={() => {
                        setCategoryUuid(undefined);
                        setPage(1);
                    }}
                >
                    All
                </Button>
                {(categories ?? []).map((category) => (
                    <Button
                        key={category.categoryUuid}
                        size="compact-xs"
                        variant={
                            categoryUuid === category.categoryUuid
                                ? 'filled'
                                : 'default'
                        }
                        onClick={() => {
                            setCategoryUuid(category.categoryUuid);
                            setPage(1);
                        }}
                    >
                        {category.name}
                    </Button>
                ))}
            </Group>
            <div>
                {(data?.items ?? []).map((announcement) => (
                    <div
                        key={announcement.announcementUuid}
                        className={classes.archiveRow}
                    >
                        <CategoryBadge
                            category={
                                announcement.categoryUuid
                                    ? byUuid.get(announcement.categoryUuid)
                                    : undefined
                            }
                        />
                        <div className={classes.archiveTitle}>
                            {announcement.title}
                        </div>
                        {announcement.body && (
                            <div className={classes.archiveBody}>
                                <AnnouncementContent
                                    projectUuid={projectUuid}
                                    text={announcement.body}
                                />
                            </div>
                        )}
                        <div className={classes.meta}>
                            <Timestamp announcement={announcement} />
                        </div>
                    </div>
                ))}
            </div>
            {totalPages > 1 && (
                <Group justify="space-between" mt="md">
                    <Button
                        size="compact-sm"
                        variant="default"
                        disabled={page <= 1}
                        onClick={() => setPage((prev) => prev - 1)}
                    >
                        Newer
                    </Button>
                    <Text size="xs" c="dimmed">
                        Page {page} of {totalPages}
                    </Text>
                    <Button
                        size="compact-sm"
                        variant="default"
                        disabled={page >= totalPages}
                        onClick={() => setPage((prev) => prev + 1)}
                    >
                        Older
                    </Button>
                </Group>
            )}
        </Drawer>
    );
};

const FrontPage: FC<{
    projectUuid: string;
    items: FeedItem[];
    totalCount: number;
    onOpenArchive: () => void;
    itemActions?: (item: FeedItem) => ReactNode;
}> = ({ projectUuid, items, totalCount, onOpenArchive, itemActions }) => {
    const [lead, ...others] = items;
    const briefs = others.slice(0, BRIEFS_COUNT);
    if (!lead) return null;
    return (
        <div className={classes.frontPage}>
            <div className={`${classes.lead} ${classes.editableItem}`}>
                <CategoryBadge category={lead.category} />
                <div className={classes.serifHeadline}>
                    {lead.announcement.title}
                </div>
                {lead.announcement.body && (
                    <div className={classes.leadBody}>
                        <AnnouncementContent
                            projectUuid={projectUuid}
                            text={lead.announcement.body}
                        />
                    </div>
                )}
                <div className={classes.meta}>
                    <Timestamp announcement={lead.announcement} />
                </div>
                {itemActions && (
                    <div className={classes.itemActions}>
                        {itemActions(lead)}
                    </div>
                )}
            </div>
            {briefs.length > 0 && (
                <div className={classes.briefs}>
                    {briefs.map((item) => (
                        <div
                            key={item.announcement.announcementUuid}
                            className={`${classes.briefRow} ${classes.editableItem}`}
                        >
                            <CategoryBadge category={item.category} />
                            <div className={classes.briefTitle}>
                                {item.announcement.title}
                            </div>
                            <div className={classes.briefMeta}>
                                <Timestamp announcement={item.announcement} />
                            </div>
                            {itemActions && (
                                <div className={classes.itemActions}>
                                    {itemActions(item)}
                                </div>
                            )}
                        </div>
                    ))}
                    {totalCount > 1 + briefs.length && (
                        <button
                            type="button"
                            className={classes.viewAll}
                            onClick={onOpenArchive}
                        >
                            All announcements ({totalCount}) →
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export const AnnouncementsBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    const [archiveOpen, setArchiveOpen] = useState(false);
    const categoryUuids =
        block.type === 'announcements' ? block.config.categoryUuids : [];
    const feed = useAnnouncementFeed(projectUuid, categoryUuids);
    if (block.type !== 'announcements' || feed.items.length === 0) {
        return null;
    }
    return (
        <Stack gap={0}>
            <BlockHeader icon={IconSpeakerphone} title={block.config.title} />
            <FrontPage
                projectUuid={projectUuid}
                items={feed.items}
                totalCount={feed.totalCount}
                onOpenArchive={() => setArchiveOpen(true)}
            />
            <ArchiveDrawer
                projectUuid={projectUuid}
                opened={archiveOpen}
                onClose={() => setArchiveOpen(false)}
            />
        </Stack>
    );
};

const EditAnnouncementModal: FC<{
    projectUuid: string;
    announcement: ProjectAnnouncement;
    categories: AnnouncementCategory[];
    onClose: () => void;
}> = ({ projectUuid, announcement, categories, onClose }) => {
    const [title, setTitle] = useState(announcement.title);
    const [body, setBody] = useState(announcement.body ?? '');
    const [categoryUuid, setCategoryUuid] = useState<string | null>(
        announcement.categoryUuid,
    );
    const { mutate: update, isLoading } = useUpdateAnnouncement(projectUuid);
    const handleSave = () => {
        if (title.trim().length === 0) return;
        update(
            {
                announcementUuid: announcement.announcementUuid,
                title: title.trim(),
                body: body.trim() || null,
                categoryUuid,
            },
            { onSuccess: onClose },
        );
    };
    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Edit announcement"
            size="md"
            onConfirm={handleSave}
            confirmLabel={isLoading ? 'Saving…' : 'Save'}
        >
            <Stack gap="sm">
                <TextInput
                    label="Headline"
                    value={title}
                    onChange={(e) => setTitle(e.currentTarget.value)}
                />
                <Textarea
                    label="Body (markdown)"
                    autosize
                    minRows={3}
                    value={body}
                    onChange={(e) => setBody(e.currentTarget.value)}
                />
                <Select
                    label="Category"
                    clearable
                    value={categoryUuid}
                    onChange={setCategoryUuid}
                    data={categories.map((category) => ({
                        value: category.categoryUuid,
                        label: category.name,
                    }))}
                />
            </Stack>
        </MantineModal>
    );
};

export const AnnouncementsBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange: _onChange,
}) => {
    const [archiveOpen, setArchiveOpen] = useState(false);
    const [editing, setEditing] = useState<ProjectAnnouncement | null>(null);
    const [composerCategory, setComposerCategory] = useState<string | null>(
        null,
    );
    const categoryUuids =
        block.type === 'announcements' ? block.config.categoryUuids : [];
    const feed = useAnnouncementFeed(projectUuid, categoryUuids);
    const { data: categories } = useAnnouncementCategories(projectUuid);
    const { mutate: create } = useCreateAnnouncement(projectUuid);
    const { mutate: update } = useUpdateAnnouncement(projectUuid);
    const { mutate: remove } = useDeleteAnnouncement(projectUuid);
    if (block.type !== 'announcements') return null;

    const itemActions = ({ announcement }: FeedItem) => (
        <>
            <Tooltip
                label={announcement.pinned ? 'Unpin' : 'Pin as lead story'}
            >
                <ActionIcon
                    variant="subtle"
                    color="ldGray.6"
                    size="sm"
                    aria-label={announcement.pinned ? 'Unpin' : 'Pin'}
                    onClick={() =>
                        update({
                            announcementUuid: announcement.announcementUuid,
                            pinned: !announcement.pinned,
                        })
                    }
                >
                    <MantineIcon
                        icon={announcement.pinned ? IconPinnedOff : IconPin}
                    />
                </ActionIcon>
            </Tooltip>
            <Tooltip label="Edit">
                <ActionIcon
                    variant="subtle"
                    color="ldGray.6"
                    size="sm"
                    aria-label="Edit announcement"
                    onClick={() => setEditing(announcement)}
                >
                    <MantineIcon icon={IconPencil} />
                </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete">
                <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    aria-label="Delete announcement"
                    onClick={() => remove(announcement.announcementUuid)}
                >
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Tooltip>
        </>
    );

    return (
        <Stack gap="xs">
            <BlockHeader icon={IconSpeakerphone} title={block.config.title} />
            {feed.items.length > 0 ? (
                <FrontPage
                    projectUuid={projectUuid}
                    items={feed.items}
                    totalCount={feed.totalCount}
                    onOpenArchive={() => setArchiveOpen(true)}
                    itemActions={itemActions}
                />
            ) : (
                <div className={classes.emptyHint}>
                    No announcements yet — post the first one below. The block
                    hides itself on the homepage until there is something to
                    show.
                </div>
            )}
            <Group gap="xs" align="flex-end" wrap="nowrap">
                <div className={blockClasses.flexFill}>
                    <AnnouncementComposer
                        projectUuid={projectUuid}
                        onPost={(markdown) => {
                            const { title, body } = splitHeadline(markdown);
                            if (title.length === 0) return;
                            create({
                                title,
                                body,
                                categoryUuid: composerCategory,
                            });
                        }}
                    />
                </div>
                <Select
                    aria-label="Category for the next announcement"
                    placeholder="Category"
                    size="xs"
                    w={140}
                    clearable
                    value={composerCategory}
                    onChange={setComposerCategory}
                    data={(categories ?? []).map((category) => ({
                        value: category.categoryUuid,
                        label: category.name,
                    }))}
                />
            </Group>
            <ArchiveDrawer
                projectUuid={projectUuid}
                opened={archiveOpen}
                onClose={() => setArchiveOpen(false)}
            />
            {editing && (
                <EditAnnouncementModal
                    projectUuid={projectUuid}
                    announcement={editing}
                    categories={categories ?? []}
                    onClose={() => setEditing(null)}
                />
            )}
        </Stack>
    );
};
