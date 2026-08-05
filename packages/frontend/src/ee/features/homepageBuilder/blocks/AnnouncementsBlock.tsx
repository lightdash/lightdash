import { subject } from '@casl/ability';
import {
    ANNOUNCEMENT_BODY_MAX_LENGTH,
    ANNOUNCEMENT_CATEGORY_META,
    AnnouncementCategory,
    type ProjectAnnouncement,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Divider,
    Group,
    Select,
    Skeleton,
    Stack,
    Switch,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import {
    IconChevronDown,
    IconChevronRight,
    IconClock,
    IconPencil,
    IconPin,
    IconPinnedOff,
    IconPlus,
    IconSend,
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
import CalendarPickerInput from '../../../../components/common/DatePickers/CalendarPickerInput';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { SlackChannelSelect } from '../../../../components/common/SlackChannelSelect';
import { useGetSlack } from '../../../../hooks/slack/useSlack';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import useApp from '../../../../providers/App/useApp';
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

const NOOP = () => {};

const CATEGORY_OPTIONS = Object.values(AnnouncementCategory).map((value) => ({
    value,
    label: ANNOUNCEMENT_CATEGORY_META[value].label,
}));

const AnnouncementCategoryBadge: FC<{ category: AnnouncementCategory }> = ({
    category,
}) => {
    const meta = ANNOUNCEMENT_CATEGORY_META[category];
    if (!meta) return null;
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
    const clampRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // The clamp height lives in CSS; overflow is whatever the clamped box
    // couldn't fit. Measured against the inner content, which is what grows.
    useEffect(() => {
        const clampEl = clampRef.current;
        const contentEl = contentRef.current;
        if (!clampEl || !contentEl || expanded) return undefined;
        const measure = () =>
            setOverflowing(clampEl.scrollHeight > clampEl.clientHeight);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(contentEl);
        return () => observer.disconnect();
    }, [body, expanded]);

    const clampClass = expanded
        ? undefined
        : overflowing
          ? `${classes.clamped} ${classes.clampFade}`
          : classes.clamped;
    return (
        <div className={classes.cardBody}>
            <div ref={clampRef} className={clampClass}>
                <div ref={contentRef}>
                    <TiptapMarkdownEditor
                        key={body}
                        content={body}
                        editable={false}
                        mentionProjectUuid={projectUuid}
                        onChange={NOOP}
                    />
                </div>
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
    <div
        className={
            announcement.published
                ? classes.card
                : `${classes.card} ${classes.cardDraft}`
        }
    >
        {(announcement.pinned || !announcement.published) && (
            <div className={classes.cardHeader}>
                <span className={classes.headerTags}>
                    {!announcement.published &&
                        (announcement.scheduledPublishAt ? (
                            <span className={classes.draftTag}>
                                <MantineIcon icon={IconClock} size="sm" />
                                Scheduled ·{' '}
                                {new Date(
                                    announcement.scheduledPublishAt,
                                ).toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                })}
                            </span>
                        ) : (
                            <span className={classes.draftTag}>Draft</span>
                        ))}
                    {announcement.pinned && (
                        <span className={classes.pinnedTag}>
                            <MantineIcon icon={IconPin} size="sm" />
                            Pinned
                        </span>
                    )}
                </span>
            </div>
        )}
        <div className={classes.cardTitle}>
            {announcement.title}
            {announcement.category && (
                <AnnouncementCategoryBadge category={announcement.category} />
            )}
        </div>
        {announcement.body && (
            <ClampedBody projectUuid={projectUuid} body={announcement.body} />
        )}
        <div className={classes.meta}>
            <Timestamp announcement={announcement} />
        </div>
        {actions && <div className={classes.itemActions}>{actions}</div>}
    </div>
);

/** Title-only rows that expand into a full card in place. */
const CollapsedRows: FC<{
    projectUuid: string;
    items: ProjectAnnouncement[];
    renderActions?: (announcement: ProjectAnnouncement) => ReactNode;
}> = ({ projectUuid, items, renderActions }) => {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const toggleRow = (uuid: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (!next.delete(uuid)) next.add(uuid);
            return next;
        });
    return (
        <div className={classes.earlierList}>
            {items.map((announcement) =>
                expanded.has(announcement.announcementUuid) ? (
                    <div key={announcement.announcementUuid}>
                        <AnnouncementCard
                            projectUuid={projectUuid}
                            announcement={announcement}
                            actions={renderActions?.(announcement)}
                        />
                        <button
                            type="button"
                            className={classes.earlierToggle}
                            onClick={() =>
                                toggleRow(announcement.announcementUuid)
                            }
                        >
                            Show less
                        </button>
                    </div>
                ) : (
                    <button
                        key={announcement.announcementUuid}
                        type="button"
                        className={classes.earlierRow}
                        onClick={() => toggleRow(announcement.announcementUuid)}
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
    );
};

const EarlierSection: FC<{
    projectUuid: string;
    items: ProjectAnnouncement[];
    renderActions?: (announcement: ProjectAnnouncement) => ReactNode;
}> = ({ projectUuid, items, renderActions }) => {
    const [open, setOpen] = useState(false);
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
                    ? 'Show fewer'
                    : `Show ${items.length} earlier announcement${
                          items.length === 1 ? '' : 's'
                      }`}
            </button>
            {open && (
                <CollapsedRows
                    projectUuid={projectUuid}
                    items={items}
                    renderActions={renderActions}
                />
            )}
        </div>
    );
};

const AnnouncementFeed: FC<{
    projectUuid: string;
    announcements: ProjectAnnouncement[];
    collapseAfterFirst: boolean;
    renderActions?: (announcement: ProjectAnnouncement) => ReactNode;
}> = ({ projectUuid, announcements, collapseAfterFirst, renderActions }) => {
    const { top, earlier } = useMemo(() => {
        const pinned = announcements.filter((a) => a.pinned);
        const rest = announcements.filter((a) => !a.pinned);
        const ordered = [...pinned, ...rest];
        if (collapseAfterFirst)
            return { top: ordered.slice(0, 1), earlier: ordered.slice(1) };
        return {
            top: [...pinned, ...rest.slice(0, RECENT_LIMIT)],
            earlier: rest.slice(RECENT_LIMIT),
        };
    }, [announcements, collapseAfterFirst]);

    // Collapsed mode keeps the lead card and lists everything else as rows,
    // always visible rather than tucked behind another toggle.
    if (collapseAfterFirst)
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
                <CollapsedRows
                    projectUuid={projectUuid}
                    items={earlier}
                    renderActions={renderActions}
                />
            </>
        );

    // 3+ recent cards render as a bento grid: a full-width lead, the rest
    // tiled two-up, and a lone trailing tile spanning full width so the grid
    // never ends half-empty.
    const asBento = top.length >= 3;
    const restIsOdd = (top.length - 1) % 2 === 1;
    return (
        <>
            {asBento ? (
                <div className={classes.bento}>
                    {top.map((announcement, index) => {
                        const isLead = index === 0;
                        const isLoneLast =
                            restIsOdd && index === top.length - 1;
                        return (
                            <div
                                key={announcement.announcementUuid}
                                className={
                                    isLead || isLoneLast
                                        ? `${classes.bentoCell} ${classes.bentoLead}`
                                        : classes.bentoCell
                                }
                            >
                                <AnnouncementCard
                                    projectUuid={projectUuid}
                                    announcement={announcement}
                                    actions={renderActions?.(announcement)}
                                />
                            </div>
                        );
                    })}
                </div>
            ) : (
                top.map((announcement) => (
                    <AnnouncementCard
                        key={announcement.announcementUuid}
                        projectUuid={projectUuid}
                        announcement={announcement}
                        actions={renderActions?.(announcement)}
                    />
                ))
            )}
            <EarlierSection
                projectUuid={projectUuid}
                items={earlier}
                renderActions={renderActions}
            />
        </>
    );
};

const useAnnouncementFeed = (
    projectUuid: string,
    includeUnpublished = false,
) => {
    const { data, isInitialLoading, isError } = useAnnouncements(projectUuid, {
        page: 1,
        pageSize: FEED_PAGE_SIZE,
        includeUnpublished,
    });
    const announcements = useMemo(() => data?.items ?? [], [data]);
    return { announcements, isLoading: isInitialLoading, isError };
};

const FeedSkeleton: FC = () => (
    <Stack gap="xs">
        <Skeleton h={92} radius="md" />
        <Skeleton h={92} radius="md" />
    </Stack>
);

const FeedError: FC = () => (
    <div className={classes.feedError}>
        Couldn’t load announcements. Try refreshing the page.
    </div>
);

const AnnouncementItemActions: FC<{
    projectUuid: string;
    announcement: ProjectAnnouncement;
    onEdit: (announcement: ProjectAnnouncement) => void;
    onDelete: (announcement: ProjectAnnouncement) => void;
}> = ({ projectUuid, announcement, onEdit, onDelete }) => {
    const [confirmingPublish, setConfirmingPublish] = useState(false);
    const { mutate: update, isLoading: updating } =
        useUpdateAnnouncement(projectUuid);
    return (
        <>
            {!announcement.published && (
                <Tooltip label="Publish now">
                    <ActionIcon
                        variant="subtle"
                        color="ldGray.6"
                        size="sm"
                        aria-label="Publish announcement now"
                        onClick={() => setConfirmingPublish(true)}
                    >
                        <MantineIcon icon={IconSend} />
                    </ActionIcon>
                </Tooltip>
            )}
            {confirmingPublish && (
                <MantineModal
                    opened
                    onClose={() => !updating && setConfirmingPublish(false)}
                    title="Publish announcement"
                    icon={IconSend}
                    confirmLabel="Publish now"
                    confirmLoading={updating}
                    onConfirm={() =>
                        update(
                            {
                                announcementUuid: announcement.announcementUuid,
                                publishNow: true,
                            },
                            {
                                onSuccess: () => setConfirmingPublish(false),
                            },
                        )
                    }
                >
                    <Text size="sm">
                        “{announcement.title}” goes live on the homepage
                        immediately
                        {announcement.pendingSlackChannelId
                            ? ' and notifies Slack'
                            : ''}
                        {announcement.scheduledPublishAt
                            ? ', replacing its schedule'
                            : ''}
                        .
                    </Text>
                </MantineModal>
            )}
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
                    onClick={() => onEdit(announcement)}
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
                    onClick={() => onDelete(announcement)}
                >
                    <MantineIcon icon={IconTrash} />
                </ActionIcon>
            </Tooltip>
        </>
    );
};

const DeleteAnnouncementModal: FC<{
    projectUuid: string;
    announcement: ProjectAnnouncement;
    onClose: () => void;
}> = ({ projectUuid, announcement, onClose }) => {
    const { mutate: remove, isLoading: removing } =
        useDeleteAnnouncement(projectUuid);
    return (
        <MantineModal
            opened
            onClose={() => !removing && onClose()}
            title="Delete announcement"
            variant="delete"
            resourceType="announcement"
            resourceLabel={announcement.title}
            cancelDisabled={removing}
            confirmLoading={removing}
            onConfirm={() =>
                remove(announcement.announcementUuid, { onSuccess: onClose })
            }
        />
    );
};

/** Form modal wrapper mounted only while open, so plain homepage viewers
 * never pay for the Slack settings fetch the picker needs. */
const AnnouncementComposer: FC<{
    projectUuid: string;
    announcement: ProjectAnnouncement | null;
    publishNow: boolean;
    onClose: () => void;
}> = ({ projectUuid, announcement, publishNow, onClose }) => {
    const { data: slack } = useGetSlack();
    return (
        <AnnouncementFormModal
            projectUuid={projectUuid}
            announcement={announcement}
            slackInstalled={!!slack?.organizationUuid}
            publishNow={publishNow}
            onClose={onClose}
        />
    );
};

export const AnnouncementsBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    const { user } = useApp();
    const canManage =
        user.data?.ability?.can(
            'manage',
            subject('ProjectHomepage', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        ) ?? false;
    // Managers see drafts inline (tagged) so they can edit or delete them
    // from here; viewers only ever get published announcements.
    const { announcements, isLoading, isError } = useAnnouncementFeed(
        projectUuid,
        canManage,
    );
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<ProjectAnnouncement | null>(null);
    const [deleting, setDeleting] = useState<ProjectAnnouncement | null>(null);
    if (block.type !== 'announcements') return null;
    // Read mode stays invisible until there is something real to show —
    // except for managers, who keep the entry point on an empty feed.
    if (isLoading || isError) return null;
    if (announcements.length === 0 && !canManage) return null;
    return (
        <Stack gap="sm" className={classes.feedBand}>
            <BlockHeader
                icon={IconSpeakerphone}
                title={block.config.title}
                actions={
                    canManage ? (
                        <Button
                            variant="subtle"
                            color="ldGray.7"
                            size="compact-xs"
                            leftSection={
                                <MantineIcon icon={IconPlus} size="sm" />
                            }
                            onClick={() => setCreating(true)}
                        >
                            New announcement
                        </Button>
                    ) : undefined
                }
            />
            {announcements.length === 0 ? (
                <div className={classes.emptyHint}>
                    No announcements yet — share your first update. Viewers
                    don’t see this block while it’s empty.
                </div>
            ) : (
                <AnnouncementFeed
                    projectUuid={projectUuid}
                    announcements={announcements}
                    collapseAfterFirst={
                        block.config.collapseAfterFirst ?? false
                    }
                    renderActions={
                        canManage
                            ? (announcement) => (
                                  <AnnouncementItemActions
                                      projectUuid={projectUuid}
                                      announcement={announcement}
                                      onEdit={setEditing}
                                      onDelete={setDeleting}
                                  />
                              )
                            : undefined
                    }
                />
            )}
            {(creating || editing !== null) && (
                <AnnouncementComposer
                    projectUuid={projectUuid}
                    announcement={editing}
                    publishNow={creating}
                    onClose={() => {
                        setCreating(false);
                        setEditing(null);
                    }}
                />
            )}
            {deleting !== null && (
                <DeleteAnnouncementModal
                    projectUuid={projectUuid}
                    announcement={deleting}
                    onClose={() => setDeleting(null)}
                />
            )}
        </Stack>
    );
};

const AnnouncementFormModal: FC<{
    projectUuid: string;
    announcement: ProjectAnnouncement | null;
    slackInstalled: boolean;
    /** Publish immediately on create (posting from the live homepage)
     * instead of the builder's draft-until-homepage-publish flow. */
    publishNow?: boolean;
    onClose: () => void;
}> = ({
    projectUuid,
    announcement,
    slackInstalled,
    publishNow = false,
    onClose,
}) => {
    const isEdit = announcement !== null;
    // Slack can only be retargeted while the announcement is still a draft.
    const slackEditable = slackInstalled && !announcement?.published;
    const initialSlackChannelId = announcement?.pendingSlackChannelId ?? null;
    const initialSchedule = announcement?.scheduledPublishAt
        ? new Date(announcement.scheduledPublishAt)
        : null;
    const [title, setTitle] = useState(announcement?.title ?? '');
    const [body, setBody] = useState(announcement?.body ?? '');
    const [category, setCategory] = useState<AnnouncementCategory | null>(
        announcement?.category ?? null,
    );
    const [slackChannelId, setSlackChannelId] = useState<string | null>(
        initialSlackChannelId,
    );
    const [scheduleEnabled, setScheduleEnabled] = useState(
        initialSchedule !== null,
    );
    const [scheduleDate, setScheduleDate] = useState<Date | null>(
        initialSchedule,
    );
    const [scheduleTime, setScheduleTime] = useState(
        initialSchedule
            ? `${String(initialSchedule.getHours()).padStart(2, '0')}:${String(
                  initialSchedule.getMinutes(),
              ).padStart(2, '0')}`
            : '09:00',
    );
    // Wall-clock date+time in the admin's local timezone → a UTC instant.
    const scheduledAt = useMemo(() => {
        if (!scheduleEnabled || !scheduleDate) return null;
        const [hours, minutes] = scheduleTime.split(':').map(Number);
        const combined = new Date(scheduleDate);
        combined.setHours(hours || 0, minutes || 0, 0, 0);
        return combined;
    }, [scheduleEnabled, scheduleDate, scheduleTime]);
    const scheduleInPast =
        scheduledAt !== null && scheduledAt.getTime() <= Date.now();
    const { mutate: create, isLoading: creating } =
        useCreateAnnouncement(projectUuid);
    const { mutate: update, isLoading: updating } =
        useUpdateAnnouncement(projectUuid);
    const uploadImage = useUploadAnnouncementImage(projectUuid);
    const isLoading = creating || updating;
    const bodyTooLong = body.trim().length > ANNOUNCEMENT_BODY_MAX_LENGTH;

    const handleSave = () => {
        const trimmedTitle = title.trim();
        if (trimmedTitle.length === 0 || bodyTooLong) return;
        const bodyValue = body.trim() || null;
        if (isEdit) {
            update(
                {
                    announcementUuid: announcement.announcementUuid,
                    title: trimmedTitle,
                    body: bodyValue,
                    category,
                    // Omitted when untouched — PATCH leaves it unchanged.
                    ...(slackEditable &&
                    slackChannelId !== initialSlackChannelId
                        ? { slackChannelId }
                        : {}),
                    ...(scheduledAt &&
                    scheduledAt.getTime() !== initialSchedule?.getTime()
                        ? { scheduledPublishAt: scheduledAt }
                        : {}),
                    ...(!scheduleEnabled && initialSchedule
                        ? { scheduledPublishAt: null }
                        : {}),
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
                    ...(scheduledAt
                        ? { scheduledPublishAt: scheduledAt }
                        : publishNow
                          ? { publishNow: true }
                          : {}),
                },
                { onSuccess: onClose },
            );
        }
    };

    let saveLabel = 'Create draft';
    if (isEdit) saveLabel = 'Save';
    else if (scheduledAt)
        saveLabel = slackChannelId ? 'Schedule & queue Slack' : 'Schedule';
    else if (publishNow)
        saveLabel = slackChannelId ? 'Post & send to Slack' : 'Post';
    else if (slackChannelId) saveLabel = 'Create draft & queue Slack';

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={isEdit ? 'Edit announcement' : 'New announcement'}
            icon={IconSpeakerphone}
            size="lg"
            onConfirm={handleSave}
            confirmLabel={saveLabel}
            confirmDisabled={
                title.trim().length === 0 ||
                bodyTooLong ||
                (scheduleEnabled && (!scheduledAt || scheduleInPast))
            }
            confirmLoading={isLoading}
        >
            <Stack gap="md">
                <div className={classes.doc}>
                    <TextInput
                        variant="unstyled"
                        placeholder="Announcement title"
                        classNames={{ input: classes.docTitle }}
                        value={title}
                        onChange={(e) => setTitle(e.currentTarget.value)}
                        data-autofocus
                    />
                    <div className={classes.docBody}>
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
                <Divider />
                <Group grow align="flex-start" wrap="nowrap">
                    <Select
                        label="Category"
                        placeholder="None"
                        clearable
                        size="sm"
                        radius="md"
                        data={CATEGORY_OPTIONS}
                        value={category}
                        onChange={(value) =>
                            setCategory(value as AnnouncementCategory | null)
                        }
                    />
                    {slackEditable && (
                        <SlackChannelSelect
                            label="Notify Slack"
                            placeholder="No notification"
                            size="sm"
                            radius="md"
                            value={slackChannelId}
                            onChange={setSlackChannelId}
                        />
                    )}
                </Group>
                {!announcement?.published && (
                    <Stack gap="xs">
                        <Switch
                            size="xs"
                            label="Schedule publish"
                            checked={scheduleEnabled}
                            onChange={(event) =>
                                setScheduleEnabled(event.currentTarget.checked)
                            }
                        />
                        {scheduleEnabled && (
                            <Group grow align="flex-start" wrap="nowrap">
                                <CalendarPickerInput
                                    label="Date"
                                    size="sm"
                                    radius="md"
                                    value={scheduleDate}
                                    onChange={setScheduleDate}
                                    minDate={new Date()}
                                />
                                <TimeInput
                                    label="Time"
                                    size="sm"
                                    radius="md"
                                    value={scheduleTime}
                                    onChange={(event) =>
                                        setScheduleTime(
                                            event.currentTarget.value,
                                        )
                                    }
                                />
                            </Group>
                        )}
                    </Stack>
                )}
                {bodyTooLong && (
                    <Text size="xs" c="red">
                        Body is {body.trim().length.toLocaleString()} characters
                        — trim it to{' '}
                        {ANNOUNCEMENT_BODY_MAX_LENGTH.toLocaleString()} or
                        fewer.
                    </Text>
                )}
                {scheduleEnabled && scheduleInPast ? (
                    <Text size="xs" c="red">
                        Pick a publish time in the future.
                    </Text>
                ) : scheduleEnabled && scheduledAt ? (
                    <Text size="xs" c="dimmed">
                        Publishes automatically on{' '}
                        {scheduledAt.toLocaleString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                        })}{' '}
                        (your local time)
                        {slackChannelId ? ' and notifies Slack then' : ''}.
                    </Text>
                ) : !isEdit && publishNow ? (
                    <Text size="xs" c="dimmed">
                        Goes live on the homepage immediately
                        {slackChannelId ? ' and notifies Slack' : ''}.
                    </Text>
                ) : (
                    !announcement?.published && (
                        <Text size="xs" c="dimmed">
                            Saved as a draft. It
                            {slackChannelId
                                ? ' and its Slack notification'
                                : ''}{' '}
                            goes live when you publish the homepage.
                        </Text>
                    )
                )}
            </Stack>
        </MantineModal>
    );
};

export const AnnouncementsBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange,
}) => {
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<ProjectAnnouncement | null>(null);
    const [deleting, setDeleting] = useState<ProjectAnnouncement | null>(null);
    // Build mode shows drafts too (they stay hidden on the live homepage).
    const { announcements, isLoading, isError } = useAnnouncementFeed(
        projectUuid,
        true,
    );
    // Warmed here so the Slack picker is ready the instant the modal opens.
    const { data: slack } = useGetSlack();
    const slackInstalled = !!slack?.organizationUuid;
    if (block.type !== 'announcements') return null;
    const collapseAfterFirst = block.config.collapseAfterFirst ?? false;

    const itemActions = (announcement: ProjectAnnouncement) => (
        <AnnouncementItemActions
            projectUuid={projectUuid}
            announcement={announcement}
            onEdit={setEditing}
            onDelete={setDeleting}
        />
    );

    return (
        <Stack gap="sm">
            <BlockHeader icon={IconSpeakerphone} title={block.config.title} />
            <Switch
                size="xs"
                label="Collapse all but the first announcement"
                checked={collapseAfterFirst}
                onChange={(e) =>
                    onChange({
                        ...block,
                        config: {
                            ...block.config,
                            collapseAfterFirst: e.currentTarget.checked,
                        },
                    })
                }
            />
            <Button
                variant="default"
                size="xs"
                leftSection={<MantineIcon icon={IconPlus} />}
                onClick={() => setCreating(true)}
                className={classes.newAnnouncementButton}
            >
                New announcement
            </Button>
            {isLoading ? (
                <FeedSkeleton />
            ) : isError ? (
                <FeedError />
            ) : announcements.length === 0 ? (
                <div className={classes.emptyHint}>
                    No announcements yet — share your first update. The block
                    stays hidden on the homepage until there is something to
                    show.
                </div>
            ) : (
                <AnnouncementFeed
                    projectUuid={projectUuid}
                    announcements={announcements}
                    collapseAfterFirst={collapseAfterFirst}
                    renderActions={itemActions}
                />
            )}
            {(creating || editing !== null) && (
                <AnnouncementFormModal
                    projectUuid={projectUuid}
                    announcement={editing}
                    slackInstalled={slackInstalled}
                    onClose={() => {
                        setCreating(false);
                        setEditing(null);
                    }}
                />
            )}
            {deleting !== null && (
                <DeleteAnnouncementModal
                    projectUuid={projectUuid}
                    announcement={deleting}
                    onClose={() => setDeleting(null)}
                />
            )}
        </Stack>
    );
};
