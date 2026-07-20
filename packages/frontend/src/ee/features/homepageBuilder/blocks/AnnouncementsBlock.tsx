import {
    ANNOUNCEMENT_CATEGORY_META,
    AnnouncementCategory,
    type ProjectAnnouncement,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Drawer,
    Group,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconPencil,
    IconPin,
    IconPinnedOff,
    IconPlus,
    IconSpeakerphone,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import { CategoryBadge } from '../../../../components/common/CategoryBadge/CategoryBadge';
import MantineIcon from '../../../../components/common/MantineIcon';
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
        <CategoryBadge label={meta.label} color={meta.color} variant="token" />
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
            <div className={classes.cardBody}>
                <TiptapMarkdownEditor
                    content={announcement.body}
                    editable={false}
                    mentionProjectUuid={projectUuid}
                    onChange={NOOP}
                />
            </div>
        )}
        <div className={classes.meta}>
            <Timestamp announcement={announcement} />
        </div>
        {actions && <div className={classes.itemActions}>{actions}</div>}
    </div>
);

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
            {announcements.map((announcement) => (
                <AnnouncementCard
                    key={announcement.announcementUuid}
                    projectUuid={projectUuid}
                    announcement={announcement}
                />
            ))}
        </Stack>
    );
};

const AnnouncementDrawer: FC<{
    projectUuid: string;
    announcement: ProjectAnnouncement | null;
    onClose: () => void;
}> = ({ projectUuid, announcement, onClose }) => {
    const isEdit = announcement !== null;
    const { user } = useApp();
    const [title, setTitle] = useState(announcement?.title ?? '');
    const [body, setBody] = useState(announcement?.body ?? '');
    const [category, setCategory] = useState<AnnouncementCategory | null>(
        announcement?.category ?? null,
    );
    const [debouncedBody] = useDebouncedValue(body, 350);
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
                { title: trimmedTitle, body: bodyValue, category },
                { onSuccess: onClose },
            );
        }
    };

    const authorName = user.data
        ? `${user.data.firstName} ${user.data.lastName}`.trim()
        : null;
    const previewAnnouncement: ProjectAnnouncement = {
        announcementUuid: 'preview',
        projectUuid,
        title: title.trim() || 'Untitled announcement',
        body: debouncedBody.trim() || null,
        category,
        pinned: false,
        createdByUserUuid: null,
        authorName,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    return (
        <Drawer
            opened
            onClose={onClose}
            position="right"
            size="xl"
            title={isEdit ? 'Edit announcement' : 'New announcement'}
        >
            <div className={classes.drawerLayout}>
                <div className={classes.drawerForm}>
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
                </div>
                <div className={classes.drawerPreview}>
                    <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
                        Preview
                    </Text>
                    <AnnouncementCard
                        key={`${previewAnnouncement.title}|${category ?? ''}|${debouncedBody}`}
                        projectUuid={projectUuid}
                        announcement={previewAnnouncement}
                    />
                </div>
            </div>
            <Group justify="flex-end" mt="lg">
                <Button variant="default" onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    onClick={handleSave}
                    loading={isLoading}
                    disabled={title.trim().length === 0}
                >
                    {isEdit ? 'Save' : 'Publish'}
                </Button>
            </Group>
        </Drawer>
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
                variant="light"
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
                announcements.map((announcement) => (
                    <AnnouncementCard
                        key={announcement.announcementUuid}
                        projectUuid={projectUuid}
                        announcement={announcement}
                        actions={itemActions(announcement)}
                    />
                ))
            )}
            {(creating || editing !== null) && (
                <AnnouncementDrawer
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
