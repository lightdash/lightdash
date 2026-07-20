import { type ProjectAnnouncement } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import {
    IconPencil,
    IconPin,
    IconPinnedOff,
    IconPlus,
    IconSpeakerphone,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import {
    useAnnouncements,
    useCreateAnnouncement,
    useDeleteAnnouncement,
    useUpdateAnnouncement,
    useUploadAnnouncementImage,
} from '../hooks/useAnnouncements';
import { AnnouncementContent } from './announcements/AnnouncementContent';
import classes from './announcements/announcements.module.css';
import { BlockHeader } from './BlockShell';
import { TiptapMarkdownEditor } from './markdownEditor/TiptapMarkdownEditor';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const FEED_PAGE_SIZE = 25;

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
        {announcement.pinned && (
            <div className={classes.pinnedTag}>
                <MantineIcon icon={IconPin} size="sm" />
                Pinned
            </div>
        )}
        <div className={classes.cardTitle}>{announcement.title}</div>
        {announcement.body && (
            <div className={classes.cardBody}>
                <AnnouncementContent
                    projectUuid={projectUuid}
                    text={announcement.body}
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

const AnnouncementFormModal: FC<{
    projectUuid: string;
    announcement: ProjectAnnouncement | null;
    onClose: () => void;
}> = ({ projectUuid, announcement, onClose }) => {
    const isEdit = announcement !== null;
    const [title, setTitle] = useState(announcement?.title ?? '');
    const [body, setBody] = useState(announcement?.body ?? '');
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
                },
                { onSuccess: onClose },
            );
        } else {
            create(
                { title: trimmedTitle, body: bodyValue },
                { onSuccess: onClose },
            );
        }
    };

    let confirmLabel = isEdit ? 'Save' : 'Publish';
    if (isLoading) confirmLabel = 'Saving…';

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={isEdit ? 'Edit announcement' : 'New announcement'}
            size="lg"
            onConfirm={handleSave}
            confirmLabel={confirmLabel}
        >
            <Stack gap="sm">
                <TextInput
                    label="Title"
                    placeholder="What's the update?"
                    value={title}
                    onChange={(e) => setTitle(e.currentTarget.value)}
                    data-autofocus
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
            {creating && (
                <AnnouncementFormModal
                    projectUuid={projectUuid}
                    announcement={null}
                    onClose={() => setCreating(false)}
                />
            )}
            {editing && (
                <AnnouncementFormModal
                    projectUuid={projectUuid}
                    announcement={editing}
                    onClose={() => setEditing(null)}
                />
            )}
        </Stack>
    );
};
