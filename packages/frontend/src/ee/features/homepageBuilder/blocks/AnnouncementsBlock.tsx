import { type HomepageAnnouncementItem } from '@lightdash/common';
import { ActionIcon, Stack } from '@mantine-8/core';
import { IconSpeakerphone, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import useApp from '../../../../providers/App/useApp';
import { AnnouncementComposer } from './announcements/AnnouncementComposer';
import { AnnouncementContent } from './announcements/AnnouncementContent';
import { BlockHeader } from './BlockShell';
import classes from './blockStyles.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const AnnouncementRow: FC<{
    item: HomepageAnnouncementItem;
    projectUuid: string;
    onRemove?: () => void;
}> = ({ item, projectUuid, onRemove }) => {
    const timeAgo = useTimeAgo(item.date);
    return (
        <div className={`${classes.listRow} ${classes.listRowTop}`}>
            <span className={classes.announcementDot} />
            <div className={classes.flexFill}>
                <div className={classes.announcementText}>
                    <AnnouncementContent
                        projectUuid={projectUuid}
                        text={item.text}
                    />
                </div>
                <div
                    className={`${classes.rowAside} ${classes.rowAsideSpaced}`}
                >
                    {timeAgo} · {item.author}
                </div>
            </div>
            {onRemove && (
                <ActionIcon
                    variant="subtle"
                    color="ldGray.6"
                    size="sm"
                    aria-label="Remove announcement"
                    onClick={onRemove}
                >
                    <MantineIcon icon={IconX} />
                </ActionIcon>
            )}
        </div>
    );
};

export const AnnouncementsBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    if (block.type !== 'announcements' || block.config.items.length === 0) {
        return null;
    }
    return (
        <Stack gap={0}>
            <BlockHeader icon={IconSpeakerphone} title={block.config.title} />
            <div className={classes.listCard}>
                {block.config.items.map((item) => (
                    <AnnouncementRow
                        key={`${item.date}-${item.author}`}
                        item={item}
                        projectUuid={projectUuid}
                    />
                ))}
            </div>
        </Stack>
    );
};

export const AnnouncementsBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange,
}) => {
    const { user } = useApp();
    if (block.type !== 'announcements') return null;

    const postAnnouncement = (text: string) => {
        const author = [user.data?.firstName, user.data?.lastName]
            .filter(Boolean)
            .join(' ');
        onChange({
            ...block,
            config: {
                ...block.config,
                items: [
                    {
                        text,
                        date: new Date().toISOString(),
                        author,
                    },
                    ...block.config.items,
                ],
            },
        });
    };

    return (
        <Stack gap={0}>
            <BlockHeader icon={IconSpeakerphone} title={block.config.title} />
            <div className={`${classes.listCard} ${classes.listCardSpaced}`}>
                {block.config.items.map((item, index) => (
                    <AnnouncementRow
                        key={`${item.date}-${item.author}`}
                        item={item}
                        projectUuid={projectUuid}
                        onRemove={() =>
                            onChange({
                                ...block,
                                config: {
                                    ...block.config,
                                    items: block.config.items.filter(
                                        (_, i) => i !== index,
                                    ),
                                },
                            })
                        }
                    />
                ))}
            </div>
            <AnnouncementComposer
                projectUuid={projectUuid}
                onPost={postAnnouncement}
            />
        </Stack>
    );
};
