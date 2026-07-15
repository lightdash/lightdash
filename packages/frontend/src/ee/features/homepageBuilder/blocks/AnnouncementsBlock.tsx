import { type HomepageAnnouncementItem } from '@lightdash/common';
import { ActionIcon, Group, Stack, Textarea } from '@mantine-8/core';
import { IconSend, IconSpeakerphone, IconX } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import useApp from '../../../../providers/App/useApp';
import { BlockHeader } from './BlockShell';
import classes from './blockStyles.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const AnnouncementRow: FC<{
    item: HomepageAnnouncementItem;
    onRemove?: () => void;
}> = ({ item, onRemove }) => {
    const timeAgo = useTimeAgo(item.date);
    return (
        <div className={`${classes.listRow} ${classes.listRowTop}`}>
            <span className={classes.announcementDot} />
            <div className={classes.flexFill}>
                <div className={classes.announcementText}>{item.text}</div>
                <div
                    className={`${classes.rowAside} ${classes.rowAsideSpaced}`}
                >
                    {timeAgo} · {item.author}
                </div>
            </div>
            {onRemove && (
                <ActionIcon
                    variant="subtle"
                    color="gray"
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

export const AnnouncementsBlockView: FC<BlockComponentProps> = ({ block }) => {
    if (block.type !== 'announcements' || block.config.items.length === 0) {
        return null;
    }
    return (
        <Stack gap={0}>
            <BlockHeader
                icon={IconSpeakerphone}
                iconColor="#7262FF"
                title={block.config.title}
            />
            <div className={classes.listCard}>
                {block.config.items.map((item) => (
                    <AnnouncementRow
                        key={`${item.date}-${item.author}`}
                        item={item}
                    />
                ))}
            </div>
        </Stack>
    );
};

export const AnnouncementsBlockBuild: FC<BuildComponentProps> = ({
    block,
    onChange,
}) => {
    const { user } = useApp();
    const [text, setText] = useState('');
    if (block.type !== 'announcements') return null;

    const postAnnouncement = () => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const author = [user.data?.firstName, user.data?.lastName]
            .filter(Boolean)
            .join(' ');
        onChange({
            ...block,
            config: {
                ...block.config,
                items: [
                    {
                        text: trimmed,
                        date: new Date().toISOString(),
                        author,
                    },
                    ...block.config.items,
                ],
            },
        });
        setText('');
    };

    return (
        <Stack gap={0}>
            <BlockHeader
                icon={IconSpeakerphone}
                iconColor="#7262FF"
                title={block.config.title}
            />
            <div className={`${classes.listCard} ${classes.listCardSpaced}`}>
                {block.config.items.map((item, index) => (
                    <AnnouncementRow
                        key={`${item.date}-${item.author}`}
                        item={item}
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
            <Group gap="xs" align="flex-end">
                <Textarea
                    aria-label="New announcement"
                    size="xs"
                    flex={1}
                    autosize
                    minRows={1}
                    maxRows={4}
                    placeholder="Post an announcement to this audience…"
                    value={text}
                    onChange={(e) => setText(e.currentTarget.value)}
                />
                <ActionIcon
                    variant="default"
                    size="lg"
                    aria-label="Post announcement"
                    onClick={postAnnouncement}
                >
                    <MantineIcon icon={IconSend} />
                </ActionIcon>
            </Group>
        </Stack>
    );
};
