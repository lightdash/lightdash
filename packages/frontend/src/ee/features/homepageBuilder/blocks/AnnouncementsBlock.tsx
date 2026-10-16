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
import { type TFunction } from 'i18next';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { CategoryBadge } from '../../../../components/common/CategoryBadge/CategoryBadge';
import CalendarPickerInput from '../../../../components/common/DatePickers/CalendarPickerInput';
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
import { useCanManageHomepage } from '../hooks/useHomepageAbilities';
import classes from './announcements/announcements.module.css';
import { BlockHeader } from './BlockShell';
import { TiptapMarkdownEditor } from './markdownEditor/TiptapMarkdownEditor';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const FEED_PAGE_SIZE = 25;
const RECENT_LIMIT = 5;

const NOOP = () => {};

const AnnouncementCategoryBadge: FC<{ category: AnnouncementCategory }> = ({
    category,
}) => {
    const { t } = useTranslation('homepageBuilder');
    const meta = ANNOUNCEMENT_CATEGORY_META[category];
    if (!meta) return null;
    return (
        <CategoryBadge
            label={t(`announcements.categories.${category}`)}
            color={meta.color}
            variant="dot"
        />
    );
};

const Timestamp: FC<{ announcement: ProjectAnnouncement }> = ({
    announcement,
}) => {
    const { t } = useTranslation('homepageBuilder');
    const timeAgo = useTimeAgo(new Date(announcement.createdAt));
    return (
        <>
            {announcement.authorName
                ? t('announcements.timestampBy', {
                      timeAgo,
                      author: announcement.authorName,
                  })
                : timeAgo}
        </>
    );
};

const ClampedBody: FC<{ projectUuid: string; body: string }> = ({
    projectUuid,
    body,
}) => {
    const { t } = useTranslation('homepageBuilder');
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
                    {expanded
                        ? t('favorites.showLess')
                        : t('announcements.readMore')}
                </button>
            )}
        </div>
    );
};

const AnnouncementCard: FC<{
    projectUuid: string;
    announcement: ProjectAnnouncement;
    actions?: ReactNode;
}> = ({ projectUuid, announcement, actions }) => {
    const { t } = useTranslation('homepageBuilder');
    return (
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
                                    {t('announcements.scheduledAt', {
                                        date: new Date(
                                            announcement.scheduledPublishAt,
                                        ).toLocaleString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: 'numeric',
                                            minute: '2-digit',
                                        }),
                                    })}
                                </span>
                            ) : (
                                <span className={classes.draftTag}>
                                    {t('announcements.draft')}
                                </span>
                            ))}
                        {announcement.pinned && (
                            <span className={classes.pinnedTag}>
                                <MantineIcon icon={IconPin} size="sm" />
                                {t('starter.pinned')}
                            </span>
                        )}
                    </span>
                </div>
            )}
            <div className={classes.cardTitle}>
                {announcement.title}
                {announcement.category && (
                    <AnnouncementCategoryBadge
                        category={announcement.category}
                    />
                )}
            </div>
            {announcement.body && (
                <ClampedBody
                    projectUuid={projectUuid}
                    body={announcement.body}
                />
            )}
            <div className={classes.meta}>
                <Timestamp announcement={announcement} />
            </div>
            {actions && <div className={classes.itemActions}>{actions}</div>}
        </div>
    );
};

const EarlierSection: FC<{
    projectUuid: string;
    items: ProjectAnnouncement[];
    renderActions?: (announcement: ProjectAnnouncement) => ReactNode;
}> = ({ projectUuid, items, renderActions }) => {
    const { t } = useTranslation('homepageBuilder');
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const toggleRow = (uuid: string) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (!next.delete(uuid)) next.add(uuid);
            return next;
        });
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
                    ? t('announcements.showFewer')
                    : t('announcements.showEarlier', { count: items.length })}
            </button>
            {open && (
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
                                    {t('favorites.showLess')}
                                </button>
                            </div>
                        ) : (
                            <button
                                key={announcement.announcementUuid}
                                type="button"
                                className={classes.earlierRow}
                                onClick={() =>
                                    toggleRow(announcement.announcementUuid)
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
    collapseAfterFirst: boolean;
    renderActions?: (announcement: ProjectAnnouncement) => ReactNode;
}> = ({ projectUuid, announcements, collapseAfterFirst, renderActions }) => {
    const { top, earlier } = useMemo(() => {
        const pinned = announcements.filter((a) => a.pinned);
        const rest = announcements.filter((a) => !a.pinned);
        const ordered = [...pinned, ...rest];
        // A project has at most one pinned announcement, so the lead is that
        // one when it exists and the most recent otherwise.
        if (collapseAfterFirst)
            return { top: ordered.slice(0, 1), earlier: ordered.slice(1) };
        return {
            top: [...pinned, ...rest.slice(0, RECENT_LIMIT)],
            earlier: rest.slice(RECENT_LIMIT),
        };
    }, [announcements, collapseAfterFirst]);

    // Collapsed mode keeps one lead card and puts everything else behind the
    // single toggle, rather than listing part of the tail alongside it.
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
                <EarlierSection
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

const FeedError: FC = () => {
    const { t } = useTranslation('homepageBuilder');
    return (
        <div className={classes.feedError}>{t('announcements.loadFailed')}</div>
    );
};

const AnnouncementItemActions: FC<{
    projectUuid: string;
    announcement: ProjectAnnouncement;
    onEdit: (announcement: ProjectAnnouncement) => void;
    onDelete: (announcement: ProjectAnnouncement) => void;
}> = ({ projectUuid, announcement, onEdit, onDelete }) => {
    const { t } = useTranslation('homepageBuilder');
    const [confirmingPublish, setConfirmingPublish] = useState(false);
    const { mutate: update, isLoading: updating } =
        useUpdateAnnouncement(projectUuid);
    return (
        <>
            {!announcement.published && (
                <Tooltip label={t('announcements.actions.publishNow')}>
                    <ActionIcon
                        size="sm"
                        aria-label={t('announcements.actions.publishNowAria')}
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
                    title={t('announcements.publishModal.title')}
                    icon={IconSend}
                    confirmLabel={t('announcements.actions.publishNow')}
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
                        {t(
                            `announcements.publishModal.${
                                announcement.pendingSlackChannelId
                                    ? 'withSlack'
                                    : 'noSlack'
                            }${
                                announcement.scheduledPublishAt
                                    ? 'ReplacingSchedule'
                                    : ''
                            }`,
                            { title: announcement.title },
                        )}
                    </Text>
                </MantineModal>
            )}
            <Tooltip
                label={
                    announcement.pinned
                        ? t('announcements.actions.unpin')
                        : t('announcements.actions.pinToTop')
                }
            >
                <ActionIcon
                    size="sm"
                    aria-label={
                        announcement.pinned
                            ? t('announcements.actions.unpin')
                            : t('announcements.actions.pin')
                    }
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
            <Tooltip label={t('actions.edit', { ns: 'common' })}>
                <ActionIcon
                    size="sm"
                    aria-label={t('announcements.actions.editAria')}
                    onClick={() => onEdit(announcement)}
                >
                    <MantineIcon icon={IconPencil} />
                </ActionIcon>
            </Tooltip>
            <Tooltip label={t('actions.delete', { ns: 'common' })}>
                <ActionIcon
                    color="red"
                    size="sm"
                    aria-label={t('announcements.actions.deleteAria')}
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
    const { t } = useTranslation('homepageBuilder');
    const { mutate: remove, isLoading: removing } =
        useDeleteAnnouncement(projectUuid);
    return (
        <MantineModal
            opened
            onClose={() => !removing && onClose()}
            title={t('announcements.deleteModal.title')}
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
    const { t } = useTranslation('homepageBuilder');
    const canManage = useCanManageHomepage(projectUuid);
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
                            {t('announcements.new')}
                        </Button>
                    ) : undefined
                }
            />
            {announcements.length === 0 ? (
                <div className={classes.emptyHint}>
                    {t('announcements.emptyView')}
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

const DEFAULT_SCHEDULE_TIME = '09:00';

const formatTimeOfDay = (date: Date): string =>
    `${String(date.getHours()).padStart(2, '0')}:${String(
        date.getMinutes(),
    ).padStart(2, '0')}`;

const initialFormValues = (announcement: ProjectAnnouncement | null) => ({
    title: announcement?.title ?? '',
    body: announcement?.body ?? '',
    category: announcement?.category ?? null,
    slackChannelId: announcement?.pendingSlackChannelId ?? null,
    schedule: announcement?.scheduledPublishAt
        ? new Date(announcement.scheduledPublishAt)
        : null,
});

// Wall-clock date+time in the admin's local timezone → a UTC instant.
const useScheduleFields = (initialSchedule: Date | null) => {
    const [enabled, setEnabled] = useState(initialSchedule !== null);
    const [date, setDate] = useState<Date | null>(initialSchedule);
    const [time, setTime] = useState(
        initialSchedule
            ? formatTimeOfDay(initialSchedule)
            : DEFAULT_SCHEDULE_TIME,
    );
    const scheduledAt = useMemo(() => {
        if (!enabled || !date) return null;
        const [hours, minutes] = time.split(':').map(Number);
        const combined = new Date(date);
        combined.setHours(hours || 0, minutes || 0, 0, 0);
        return combined;
    }, [enabled, date, time]);
    const isInPast =
        scheduledAt !== null && scheduledAt.getTime() <= Date.now();
    const isValid = !enabled || (scheduledAt !== null && !isInPast);
    return {
        enabled,
        setEnabled,
        date,
        setDate,
        time,
        setTime,
        scheduledAt,
        isInPast,
        isValid,
    };
};

type ScheduleFields = ReturnType<typeof useScheduleFields>;

const SchedulePicker: FC<{ schedule: ScheduleFields }> = ({ schedule }) => {
    const { t } = useTranslation('homepageBuilder');
    return (
        <Stack gap="xs">
            <Switch
                size="xs"
                label={t('announcements.schedule.label')}
                checked={schedule.enabled}
                onChange={(event) =>
                    schedule.setEnabled(event.currentTarget.checked)
                }
            />
            {schedule.enabled && (
                <Group grow align="flex-start" wrap="nowrap">
                    <CalendarPickerInput
                        label={t('announcements.schedule.date')}
                        size="sm"
                        radius="md"
                        value={schedule.date}
                        onChange={schedule.setDate}
                        minDate={new Date()}
                    />
                    <TimeInput
                        label={t('announcements.schedule.time')}
                        size="sm"
                        value={schedule.time}
                        onChange={(event) =>
                            schedule.setTime(event.currentTarget.value)
                        }
                    />
                </Group>
            )}
        </Stack>
    );
};

const saveLabelFor = (
    t: TFunction,
    {
        isEdit,
        isScheduled,
        publishNow,
        hasSlack,
    }: {
        isEdit: boolean;
        isScheduled: boolean;
        publishNow: boolean;
        hasSlack: boolean;
    },
): string => {
    if (isEdit) return t('actions.save', { ns: 'common' });
    if (isScheduled)
        return hasSlack
            ? t('announcements.save.scheduleWithSlack')
            : t('announcements.save.schedule');
    if (publishNow)
        return hasSlack
            ? t('announcements.save.postWithSlack')
            : t('announcements.save.post');
    return hasSlack
        ? t('announcements.save.draftWithSlack')
        : t('announcements.save.draft');
};

const PublishHint: FC<{
    isEdit: boolean;
    isPublished: boolean;
    publishNow: boolean;
    hasSlack: boolean;
    schedule: ScheduleFields;
}> = ({ isEdit, isPublished, publishNow, hasSlack, schedule }) => {
    const { t } = useTranslation('homepageBuilder');
    if (schedule.enabled && schedule.isInPast) {
        return (
            <Text size="xs" c="red">
                {t('announcements.hints.pastTime')}
            </Text>
        );
    }
    if (schedule.enabled && schedule.scheduledAt) {
        return (
            <Text size="xs" c="dimmed">
                {t(
                    hasSlack
                        ? 'announcements.hints.scheduledWithSlack'
                        : 'announcements.hints.scheduled',
                    {
                        date: schedule.scheduledAt.toLocaleString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                        }),
                    },
                )}
            </Text>
        );
    }
    if (!isEdit && publishNow) {
        return (
            <Text size="xs" c="dimmed">
                {hasSlack
                    ? t('announcements.hints.liveWithSlack')
                    : t('announcements.hints.live')}
            </Text>
        );
    }
    if (isPublished) return null;
    return (
        <Text size="xs" c="dimmed">
            {hasSlack
                ? t('announcements.hints.draftWithSlack')
                : t('announcements.hints.draft')}
        </Text>
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
    const { t } = useTranslation('homepageBuilder');
    const isEdit = announcement !== null;
    const isPublished = announcement?.published === true;
    // Slack can only be retargeted while the announcement is still a draft.
    const slackEditable = slackInstalled && !isPublished;
    const initial = initialFormValues(announcement);
    const [title, setTitle] = useState(initial.title);
    const [body, setBody] = useState(initial.body);
    const [category, setCategory] = useState<AnnouncementCategory | null>(
        initial.category,
    );
    const [slackChannelId, setSlackChannelId] = useState<string | null>(
        initial.slackChannelId,
    );
    const schedule = useScheduleFields(initial.schedule);
    const { scheduledAt } = schedule;
    const { mutate: create, isLoading: creating } =
        useCreateAnnouncement(projectUuid);
    const { mutate: update, isLoading: updating } =
        useUpdateAnnouncement(projectUuid);
    const uploadImage = useUploadAnnouncementImage(projectUuid);
    const isLoading = creating || updating;
    const bodyTooLong = body.trim().length > ANNOUNCEMENT_BODY_MAX_LENGTH;
    const hasSlack = !!slackChannelId;

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
                    slackChannelId !== initial.slackChannelId
                        ? { slackChannelId }
                        : {}),
                    ...(scheduledAt &&
                    scheduledAt.getTime() !== initial.schedule?.getTime()
                        ? { scheduledPublishAt: scheduledAt }
                        : {}),
                    ...(!schedule.enabled && initial.schedule
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

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={isEdit ? t('announcements.edit') : t('announcements.new')}
            icon={IconSpeakerphone}
            size="lg"
            onConfirm={handleSave}
            confirmLabel={saveLabelFor(t, {
                isEdit,
                isScheduled: scheduledAt !== null,
                publishNow,
                hasSlack,
            })}
            confirmDisabled={
                title.trim().length === 0 || bodyTooLong || !schedule.isValid
            }
            confirmLoading={isLoading}
        >
            <Stack gap="md">
                <div className={classes.doc}>
                    <TextInput
                        variant="unstyled"
                        placeholder={t('announcements.form.titlePlaceholder')}
                        classNames={{ input: classes.docTitle }}
                        value={title}
                        onChange={(e) => setTitle(e.currentTarget.value)}
                        data-autofocus
                    />
                    <div className={classes.docBody}>
                        <TiptapMarkdownEditor
                            content={initial.body}
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
                        label={t('announcements.form.category')}
                        placeholder={t('announcements.form.noCategory')}
                        clearable
                        size="sm"
                        data={Object.values(AnnouncementCategory).map(
                            (value) => ({
                                value,
                                label: t(`announcements.categories.${value}`),
                            }),
                        )}
                        value={category}
                        onChange={(value) =>
                            setCategory(value as AnnouncementCategory | null)
                        }
                    />
                    {slackEditable && (
                        <SlackChannelSelect
                            label={t('announcements.form.notifySlack')}
                            placeholder={t('announcements.form.noNotification')}
                            size="sm"
                            radius="md"
                            value={slackChannelId}
                            onChange={setSlackChannelId}
                        />
                    )}
                </Group>
                {!isPublished && <SchedulePicker schedule={schedule} />}
                {bodyTooLong && (
                    <Text size="xs" c="red">
                        {t('announcements.form.bodyTooLong', {
                            length: body.trim().length.toLocaleString(),
                            max: ANNOUNCEMENT_BODY_MAX_LENGTH.toLocaleString(),
                        })}
                    </Text>
                )}
                <PublishHint
                    isEdit={isEdit}
                    isPublished={isPublished}
                    publishNow={publishNow}
                    hasSlack={hasSlack}
                    schedule={schedule}
                />
            </Stack>
        </MantineModal>
    );
};

export const AnnouncementsBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange,
}) => {
    const { t } = useTranslation('homepageBuilder');
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
                label={t('announcements.collapseAfterFirst')}
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
                {t('announcements.new')}
            </Button>
            {isLoading ? (
                <FeedSkeleton />
            ) : isError ? (
                <FeedError />
            ) : announcements.length === 0 ? (
                <div className={classes.emptyHint}>
                    {t('announcements.emptyBuild')}
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
