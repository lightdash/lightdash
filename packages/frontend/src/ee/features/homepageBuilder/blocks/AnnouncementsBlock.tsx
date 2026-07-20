import { type ProjectAnnouncement } from '@lightdash/common';
import {
    ActionIcon,
    Stack,
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
    useAnnouncements,
    useCreateAnnouncement,
    useDeleteAnnouncement,
    useUpdateAnnouncement,
} from '../hooks/useAnnouncements';
import { AnnouncementComposer } from './announcements/AnnouncementComposer';
import { AnnouncementContent } from './announcements/AnnouncementContent';
import classes from './announcements/announcements.module.css';
import { BlockHeader } from './BlockShell';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const FEED_PAGE_SIZE = 25;

// The composer emits one markdown string; the first line is the title, the
// rest is the body.
const splitHeadline = (
    markdown: string,
): { title: string; body: string | null } => {
    const [firstLine, ...rest] = markdown.split('\n');
    const title = firstLine.replace(/^#+\s*/, '').trim();
    const body = rest.join('\n').trim();
    return { title, body: body.length > 0 ? body : null };
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

const EditAnnouncementModal: FC<{
    projectUuid: string;
    announcement: ProjectAnnouncement;
    onClose: () => void;
}> = ({ projectUuid, announcement, onClose }) => {
    const [title, setTitle] = useState(announcement.title);
    const [body, setBody] = useState(announcement.body ?? '');
    const { mutate: update, isLoading } = useUpdateAnnouncement(projectUuid);
    const handleSave = () => {
        if (title.trim().length === 0) return;
        update(
            {
                announcementUuid: announcement.announcementUuid,
                title: title.trim(),
                body: body.trim() || null,
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
                    label="Title"
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
            </Stack>
        </MantineModal>
    );
};

export const AnnouncementsBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange: _onChange,
}) => {
    const [editing, setEditing] = useState<ProjectAnnouncement | null>(null);
    const announcements = useAnnouncementFeed(projectUuid);
    const { mutate: create } = useCreateAnnouncement(projectUuid);
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
            <AnnouncementComposer
                projectUuid={projectUuid}
                onPost={(markdown) => {
                    const { title, body } = splitHeadline(markdown);
                    if (title.length === 0) return;
                    create({ title, body });
                }}
            />
            {announcements.length === 0 ? (
                <div className={classes.emptyHint}>
                    No announcements yet — share your first update above. The
                    block stays hidden on the homepage until there is something
                    to show.
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
            {editing && (
                <EditAnnouncementModal
                    projectUuid={projectUuid}
                    announcement={editing}
                    onClose={() => setEditing(null)}
                />
            )}
        </Stack>
    );
};
