import {
    ANNOUNCEMENT_CATEGORY_META,
    AnnouncementCategory,
    type ProjectAnnouncement,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconPencil,
    IconPin,
    IconPinnedOff,
    IconPlus,
    IconSpeakerphone,
    IconTrash,
} from '@tabler/icons-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { CategoryBadge } from '../../../../components/common/CategoryBadge/CategoryBadge';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { SlackChannelSelect } from '../../../../components/common/SlackChannelSelect';
import { useGetSlack } from '../../../../hooks/slack/useSlack';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import {
    useAnnouncements,
    useCreateAnnouncement,
    useDeleteAnnouncement,
    useUpdateAnnouncement,
    useUploadAnnouncementImage,
} from '../hooks/useAnnouncements';
import classes from './announcements/announcements.module.css';
import { BlockHeader } from './BlockShell';
import { TiptapMarkdownEditor } from './markdownEditor/TiptapMarkdownEditor';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const FEED_PAGE_SIZE = 25;
const RECENT_LIMIT = 3;
const CLAMP_MAX_PX = 120;

const NOOP = () => {};

const CATEGORY_OPTIONS = Object.values(AnnouncementCategory).map((value) => ({
    value,
    label: ANNOUNCEMENT_CATEGORY_META[value].label,
}));

const AnnouncementCategoryBadge: FC<{ category: AnnouncementCategory }> = ({
    category,
}) => {
    const meta = ANNOUNCEMENT_CATEGORY_META[category];
    return (
        <CategoryBadge label={meta.label} color={meta.color} variant="dot" />
    );
};

const Timestamp: FC<{ announcement: ProjectAnnouncement }> = ({
    announcement,
}) => {
    const timeAgo = useTimeAgo(new Date(announcement.createdAt));
    return (
        <>
            {timeAgo}
            {announcement.authorName ? ` by ${announcement.authorName}` : ''}
        </>
    );
};

const ClampedBody: FC<{ projectUuid: string; body: string }> = ({
    projectUuid,
    body,
}) => {
    const [expanded, setExpanded] = useState(false);
    const [overflowing, setOverflowing] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const measure = () =>
            setOverflowing(el.scrollHeight > CLAMP_MAX_PX + 8);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [body]);

    const clamped = !expanded && overflowing;
    return (
        <div className={classes.cardBody}>
            <div ref={ref} className={clamped ? classes.clamped : undefined}>
                <TiptapMarkdownEditor
                    content={body}
                    editable={false}
                    mentionProjectUuid={projectUuid}
                    onChange={NOOP}
                />
            </div>
            {overflowing && (
                <button
                    type="button"
                    className={classes.readMore}
                    onClick={() => setExpanded((value) => !value)}
                >
                    {expanded ? 'Show less' : 'Read more'}
                </button>
            )}
        </div>
    );
};

const AnnouncementCard: FC<{
    projectUuid: string;
    announcement: ProjectAnnouncement;
    actions?: ReactNode;
}> = ({ projectUuid, announcement, actions }) => (
    <div className={classes.card}>
        {(announcement.pinned || announcement.category) && (
            <div className={classes.cardHeader}>
                {announcement.pinned ? (
                    <span className={classes.pinnedTag}>
                        <MantineIcon icon={IconPin} size="sm" />
                        Pinned
                    </span>
                ) : (
                    <span />
                )}
                {announcement.category && (
                    <AnnouncementCategoryBadge
                        category={announcement.category}
                    />
                )}
            </div>
        )}
        <div className={classes.cardTitle}>{announcement.title}</div>
        {announcement.body && (
            <ClampedBody projectUuid={projectUuid} body={announcement.body} />
        )}
        <div className={classes.meta}>
            <Timestamp announcement={announcement} />
        </div>
        {actions && <div className={classes.itemActions}>{actions}</div>}
    </div>
);

const EarlierSection: FC<{
    projectUuid: string;
    items: ProjectAnnouncement[];
    renderActions?: (announcement: ProjectAnnouncement) => ReactNode;
}> = ({ projectUuid, items, renderActions }) => {
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    if (items.length === 0) return null;
    return (
        <div>
            <button
                type="button"
                className={classes.earlierToggle}
                onClick={() => setOpen((value) => !value)}
            >
                <MantineIcon
                    icon={open ? IconChevronDown : IconChevronRight}
                    size="sm"
                />
                {open
                    ? 'Hide earlier announcements'
                    : `Show ${items.length} earlier announcement${
                          items.length === 1 ? '' : 's'
                      }`}
            </button>
            {open && (
                <div className={classes.earlierList}>
                    {items.map((announcement) =>
                        expanded.has(announcement.announcementUuid) ? (
                            <AnnouncementCard
                                key={announcement.announcementUuid}
                                projectUuid={projectUuid}
                                announcement={announcement}
                                actions={renderActions?.(announcement)}
                            />
                        ) : (
                            <button
                                key={announcement.announcementUuid}
                                type="button"
                                className={classes.earlierRow}
                                onClick={() =>
                                    setExpanded((prev) =>
                                        new Set(prev).add(
                                            announcement.announcementUuid,
                                        ),
                                    )
                                }
                            >
                                <span className={classes.earlierRowTitle}>
                                    {announcement.title}
                                </span>
                                <span className={classes.earlierRowMeta}>
                                    <Timestamp announcement={announcement} />
                                </span>
                            </button>
                        ),
                    )}
                </div>
            )}
        </div>
    );
};

const AnnouncementFeed: FC<{
    projectUuid: string;
    announcements: ProjectAnnouncement[];
    renderActions?: (announcement: ProjectAnnouncement) => ReactNode;
}> = ({ projectUuid, announcements, renderActions }) => {
    const { top, earlier } = useMemo(() => {
        const pinned = announcements.filter((a) => a.pinned);
        const rest = announcements.filter((a) => !a.pinned);
        return {
            top: [...pinned, ...rest.slice(0, RECENT_LIMIT)],
            earlier: rest.slice(RECENT_LIMIT),
        };
    }, [announcements]);
    return (
        <>
            {top.map((announcement) => (
                <AnnouncementCard
                    key={announcement.announcementUuid}
                    projectUuid={projectUuid}
                    announcement={announcement}
                    actions={renderActions?.(announcement)}
                />
            ))}
            <EarlierSection
                projectUuid={projectUuid}
                items={earlier}
                renderActions={renderActions}
            />
        </>
    );
};

const useAnnouncementFeed = (projectUuid: string): ProjectAnnouncement[] => {
    const { data } = useAnnouncements(projectUuid, {
        page: 1,
        pageSize: FEED_PAGE_SIZE,
    });
    return useMemo(() => data?.items ?? [], [data]);
};

export const AnnouncementsBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    const announcements = useAnnouncementFeed(projectUuid);
    if (block.type !== 'announcements' || announcements.length === 0) {
        return null;
    }
    return (
        <Stack gap="sm">
            <BlockHeader icon={IconSpeakerphone} title={block.config.title} />
            <AnnouncementFeed
                projectUuid={projectUuid}
                announcements={announcements}
            />
        </Stack>
    );
};

const AnnouncementFormModal: FC<{
    projectUuid: string;
    announcement: ProjectAnnouncement | null;
    onClose: () => void;
}> = ({ projectUuid, announcement, onClose }) => {
    const isEdit = announcement !== null;
    const [title, setTitle] = useState(announcement?.title ?? '');
    const [body, setBody] = useState(announcement?.body ?? '');
    const [category, setCategory] = useState<AnnouncementCategory | null>(
        announcement?.category ?? null,
    );
    const [slackChannelId, setSlackChannelId] = useState<string | null>(null);
    const { data: slack } = useGetSlack();
    const slackInstalled = !!slack?.organizationUuid;
    const { mutate: create, isLoading: creating } =
        useCreateAnnouncement(projectUuid);
    const { mutate: update, isLoading: updating } =
        useUpdateAnnouncement(projectUuid);
    const uploadImage = useUploadAnnouncementImage(projectUuid);
    const isLoading = creating || updating;

    const handleSave = () => {
        const trimmedTitle = title.trim();
        if (trimmedTitle.length === 0) return;
        const bodyValue = body.trim() || null;
        if (isEdit) {
            update(
                {
                    announcementUuid: announcement.announcementUuid,
                    title: trimmedTitle,
                    body: bodyValue,
                    category,
                },
                { onSuccess: onClose },
            );
        } else {
            create(
                {
                    title: trimmedTitle,
                    body: bodyValue,
                    category,
                    slackChannelId,
                },
                { onSuccess: onClose },
            );
        }
    };

    let saveLabel = 'Publish';
    if (isEdit) saveLabel = 'Save';
    else if (slackChannelId) saveLabel = 'Publish & notify';

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={isEdit ? 'Edit announcement' : 'New announcement'}
            icon={IconSpeakerphone}
            size="lg"
            onConfirm={handleSave}
            confirmLabel={saveLabel}
            confirmDisabled={title.trim().length === 0}
            confirmLoading={isLoading}
        >
            <Stack gap="md">
                <TextInput
                    label="Title"
                    placeholder="What's the update?"
                    value={title}
                    onChange={(e) => setTitle(e.currentTarget.value)}
                    data-autofocus
                />
                <Select
                    label="Category"
                    placeholder="Pick a category"
                    clearable
                    data={CATEGORY_OPTIONS}
                    value={category}
                    onChange={(value) =>
                        setCategory(value as AnnouncementCategory | null)
                    }
                />
                <div>
                    <Text size="sm" fw={500} mb={4}>
                        Body
                    </Text>
                    <div className={classes.editorShell}>
                        <TiptapMarkdownEditor
                            content={announcement?.body ?? ''}
                            onChange={setBody}
                            onImageUpload={async (file) =>
                                (await uploadImage.mutateAsync(file)).url
                            }
                            mentionProjectUuid={projectUuid}
                        />
                    </div>
                </div>
                {!isEdit && slackInstalled && (
                    <SlackChannelSelect
                        label="Notify a Slack channel (optional)"
                        placeholder="No Slack notification"
                        value={slackChannelId}
                        onChange={setSlackChannelId}
                    />
                )}
            </Stack>
        </MantineModal>
    );
};

export const AnnouncementsBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange: _onChange,
}) => {
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<ProjectAnnouncement | null>(null);
    const announcements = useAnnouncementFeed(projectUuid);
    const { mutate: update } = useUpdateAnnouncement(projectUuid);
    const { mutate: remove } = useDeleteAnnouncement(projectUuid);
    if (block.type !== 'announcements') return null;

    const itemActions = (announcement: ProjectAnnouncement) => (
        <>
            <Tooltip label={announcement.pinned ? 'Unpin' : 'Pin to top'}>
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
        <Stack gap="sm">
            <BlockHeader icon={IconSpeakerphone} title={block.config.title} />
            <Button
                variant="default"
                size="xs"
                leftSection={<MantineIcon icon={IconPlus} />}
                onClick={() => setCreating(true)}
                style={{ alignSelf: 'flex-start' }}
            >
                New announcement
            </Button>
            {announcements.length === 0 ? (
                <div className={classes.emptyHint}>
                    No announcements yet — share your first update. The block
                    stays hidden on the homepage until there is something to
                    show.
                </div>
            ) : (
                <AnnouncementFeed
                    projectUuid={projectUuid}
                    announcements={announcements}
                    renderActions={itemActions}
                />
            )}
            {(creating || editing !== null) && (
                <AnnouncementFormModal
                    projectUuid={projectUuid}
                    announcement={editing}
                    onClose={() => {
                        setCreating(false);
                        setEditing(null);
                    }}
                />
            )}
        </Stack>
    );
};
