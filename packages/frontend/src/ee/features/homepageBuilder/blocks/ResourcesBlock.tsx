import {
    type HomepageResourceItem,
    type HomepageResourceKind,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Box,
    Card,
    Group,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import {
    IconBook,
    IconExternalLink,
    IconLink,
    IconPlus,
    IconVideo,
    IconX,
    type Icon,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const KIND_ICONS: Record<HomepageResourceKind, Icon> = {
    video: IconVideo,
    doc: IconBook,
    link: IconLink,
};

const ResourceRow: FC<{
    item: HomepageResourceItem;
    onRemove?: () => void;
}> = ({ item, onRemove }) => {
    const row = (
        <Group gap="sm" wrap="nowrap" p="xs">
            <MantineIcon icon={KIND_ICONS[item.kind] ?? IconLink} size="lg" />
            <Box style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={500} truncate>
                    {item.title}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                    {item.url}
                </Text>
            </Box>
            <Badge variant="default" size="sm" tt="capitalize">
                {item.kind}
            </Badge>
            {onRemove ? (
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={`Remove resource ${item.title}`}
                    onClick={onRemove}
                >
                    <MantineIcon icon={IconX} />
                </ActionIcon>
            ) : (
                <MantineIcon icon={IconExternalLink} color="gray" />
            )}
        </Group>
    );
    if (onRemove) return row;
    return (
        <Anchor
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            underline="never"
            c="inherit"
        >
            {row}
        </Anchor>
    );
};

export const ResourcesBlockView: FC<BlockComponentProps> = ({ block }) => {
    if (block.type !== 'resources' || block.config.items.length === 0) {
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
                        <ResourceRow key={item.url} item={item} />
                    ))}
                </Stack>
            </Card>
        </Stack>
    );
};

export const ResourcesBlockBuild: FC<BuildComponentProps> = ({
    block,
    onChange,
}) => {
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [kind, setKind] = useState<string | null>('link');
    if (block.type !== 'resources') return null;

    const addResource = () => {
        const trimmedTitle = title.trim();
        const trimmedUrl = url.trim();
        if (!trimmedTitle || !trimmedUrl) return;
        onChange({
            ...block,
            config: {
                ...block.config,
                items: [
                    ...block.config.items,
                    {
                        title: trimmedTitle,
                        url: trimmedUrl,
                        kind: (kind ?? 'link') as HomepageResourceKind,
                    },
                ],
            },
        });
        setTitle('');
        setUrl('');
    };

    return (
        <Stack gap="xs">
            <TextInput
                aria-label="Resources title"
                size="xs"
                fw={600}
                value={block.config.title}
                onChange={(e) =>
                    onChange({
                        ...block,
                        config: {
                            ...block.config,
                            title: e.currentTarget.value,
                        },
                    })
                }
            />
            <Card withBorder p={0}>
                <Stack gap={0}>
                    {block.config.items.map((item) => (
                        <ResourceRow
                            key={item.url}
                            item={item}
                            onRemove={() =>
                                onChange({
                                    ...block,
                                    config: {
                                        ...block.config,
                                        items: block.config.items.filter(
                                            (i) => i.url !== item.url,
                                        ),
                                    },
                                })
                            }
                        />
                    ))}
                </Stack>
            </Card>
            <Group gap="xs" align="flex-end">
                <TextInput
                    label="Title"
                    size="xs"
                    style={{ flex: 1 }}
                    placeholder="e.g. Intro to Lightdash (3 min)"
                    value={title}
                    onChange={(e) => setTitle(e.currentTarget.value)}
                />
                <TextInput
                    label="URL"
                    size="xs"
                    style={{ flex: 1 }}
                    placeholder="https://…"
                    value={url}
                    onChange={(e) => setUrl(e.currentTarget.value)}
                />
                <Select
                    label="Kind"
                    size="xs"
                    w={90}
                    data={[
                        { value: 'link', label: 'Link' },
                        { value: 'doc', label: 'Doc' },
                        { value: 'video', label: 'Video' },
                    ]}
                    value={kind}
                    onChange={setKind}
                />
                <ActionIcon
                    variant="default"
                    size="lg"
                    aria-label="Add resource"
                    onClick={addResource}
                >
                    <MantineIcon icon={IconPlus} />
                </ActionIcon>
            </Group>
        </Stack>
    );
};
