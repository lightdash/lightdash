import {
    type HomepageResourceItem,
    type HomepageResourceKind,
} from '@lightdash/common';
import { ActionIcon, Group, Select, Stack, TextInput } from '@mantine-8/core';
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
import { BlockHeader, IconSquare, MiniPill } from './BlockShell';
import classes from './blockStyles.module.css';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const KIND_ICONS: Record<HomepageResourceKind, Icon> = {
    video: IconVideo,
    doc: IconBook,
    link: IconLink,
};

const KIND_LABELS: Record<HomepageResourceKind, string> = {
    video: 'Video',
    doc: 'Doc',
    link: 'Link',
};

const ResourceRow: FC<{
    item: HomepageResourceItem;
    onRemove?: () => void;
}> = ({ item, onRemove }) => {
    const body = (
        <>
            <IconSquare icon={KIND_ICONS[item.kind] ?? IconLink} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div className={classes.rowName}>{item.title}</div>
                <div className={classes.rowMeta}>{item.url}</div>
            </div>
            <MiniPill>{KIND_LABELS[item.kind] ?? 'Link'}</MiniPill>
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
                <MantineIcon
                    icon={IconExternalLink}
                    size={14}
                    color="ldGray.4"
                />
            )}
        </>
    );
    if (onRemove) return <div className={classes.listRow}>{body}</div>;
    return (
        <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${classes.listRow} ${classes.clickable}`}
            style={{ color: 'inherit', textDecoration: 'none' }}
        >
            {body}
        </a>
    );
};

export const ResourcesBlockView: FC<BlockComponentProps> = ({ block }) => {
    if (block.type !== 'resources' || block.config.items.length === 0) {
        return null;
    }
    return (
        <Stack gap={0}>
            <BlockHeader icon={IconBook} title={block.config.title} />
            <div className={classes.listCard}>
                {block.config.items.map((item) => (
                    <ResourceRow key={item.url} item={item} />
                ))}
            </div>
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
            <div className={classes.listCard}>
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
            </div>
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
