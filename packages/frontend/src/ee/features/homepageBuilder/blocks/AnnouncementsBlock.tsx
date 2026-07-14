import { type HomepageAnnouncementItem } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Card,
    Group,
    Stack,
    Text,
    Textarea,
} from '@mantine-8/core';
import { IconSend, IconX } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useTimeAgo } from '../../../../hooks/useTimeAgo';
import useApp from '../../../../providers/App/useApp';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const AnnouncementRow: FC<{
    item: HomepageAnnouncementItem;
    onRemove?: () => void;
}> = ({ item, onRemove }) => {
    const timeAgo = useTimeAgo(item.date);
    return (
        <Group gap="sm" wrap="nowrap" p="sm" align="flex-start">
            <Box
                w={7}
                h={7}
                mt={6}
                bg="violet"
                style={{ borderRadius: '50%', flexShrink: 0 }}
            />
            <Box style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm">{item.text}</Text>
                <Text size="xs" c="dimmed" mt={2}>
                    {timeAgo} · {item.author}
                </Text>
            </Box>
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
        </Group>
    );
};

export const AnnouncementsBlockView: FC<BlockComponentProps> = ({ block }) => {
    if (block.type !== 'announcements' || block.config.items.length === 0) {
        return null;
    }
    return (
        <Stack gap="xs">
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                {block.config.title}
            </Text>
            <Card withBorder p={0}>
                <Stack gap={0}>
                    {block.config.items.map((item) => (
                        <AnnouncementRow
                            key={`${item.date}-${item.author}`}
                            item={item}
                        />
                    ))}
                </Stack>
            </Card>
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
        <Stack gap="xs">
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                {block.config.title}
            </Text>
            <Card withBorder p={0}>
                <Stack gap={0}>
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
                </Stack>
            </Card>
            <Group gap="xs" align="flex-end">
                <Textarea
                    aria-label="New announcement"
                    size="xs"
                    style={{ flex: 1 }}
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
