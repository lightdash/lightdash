import {
    ContentType,
    contentToResourceViewItem,
    type HomepageCollectionItemRef,
    type SummaryContent,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Card,
    Group,
    Loader,
    SimpleGrid,
    Skeleton,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconCircleCheckFilled,
    IconEye,
    IconPin,
    IconPlus,
    IconX,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { ResourceIcon } from '../../../../components/common/ResourceIcon';
import { usePinnedItems } from '../../../../hooks/pinning/usePinnedItems';
import { useInfiniteContent } from '../../../../hooks/useContent';
import { useProject } from '../../../../hooks/useProject';
import { useCollectionContent } from '../hooks/useCollectionContent';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const contentUrl = (projectUuid: string, content: SummaryContent): string =>
    content.contentType === ContentType.DASHBOARD
        ? `/projects/${projectUuid}/dashboards/${content.uuid}/view`
        : `/projects/${projectUuid}/saved/${content.uuid}`;

const toItemRef = (content: SummaryContent): HomepageCollectionItemRef => ({
    contentType:
        content.contentType === ContentType.DASHBOARD ? 'dashboard' : 'chart',
    uuid: content.uuid,
});

const ContentCard: FC<{
    content: SummaryContent;
    projectUuid: string;
    onRemove?: () => void;
}> = ({ content, projectUuid, onRemove }) => {
    const card = (
        <Card withBorder p="sm" h="100%">
            <Group gap="sm" wrap="nowrap" align="flex-start">
                <ResourceIcon item={contentToResourceViewItem(content)} />
                <Box style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={4} wrap="nowrap">
                        <Text size="sm" fw={600} truncate>
                            {content.name}
                        </Text>
                        {content.verification && (
                            <Tooltip label="Verified by the data team">
                                <MantineIcon
                                    icon={IconCircleCheckFilled}
                                    color="green"
                                />
                            </Tooltip>
                        )}
                    </Group>
                    <Group gap={4}>
                        <Text size="xs" c="dimmed" tt="capitalize">
                            {content.contentType}
                        </Text>
                        <Text size="xs" c="dimmed">
                            ·
                        </Text>
                        <MantineIcon icon={IconEye} color="gray" size="sm" />
                        <Text size="xs" c="dimmed">
                            {content.views}
                        </Text>
                    </Group>
                </Box>
                {onRemove && (
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label={`Remove ${content.name} from collection`}
                        onClick={(e) => {
                            e.preventDefault();
                            onRemove();
                        }}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                )}
            </Group>
        </Card>
    );
    if (onRemove) return card;
    return (
        <Anchor
            component={Link}
            to={contentUrl(projectUuid, content)}
            underline="never"
            c="inherit"
        >
            {card}
        </Anchor>
    );
};

const CollectionPickerModal: FC<{
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    selectedUuids: string[];
    onAdd: (ref: HomepageCollectionItemRef) => void;
}> = ({ opened, onClose, projectUuid, selectedUuids, onAdd }) => {
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const { data, isFetching } = useInfiniteContent(
        {
            projectUuids: [projectUuid],
            contentTypes: [ContentType.CHART, ContentType.DASHBOARD],
            search: debouncedSearch.length > 0 ? debouncedSearch : undefined,
            pageSize: 25,
        },
        { enabled: opened, keepPreviousData: true },
    );
    const results = (data?.pages ?? [])
        .flatMap((page) => page.data)
        .filter((content) => !selectedUuids.includes(content.uuid));

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Add content"
            size="lg"
        >
            <Stack gap="sm">
                <TextInput
                    placeholder="Search charts and dashboards…"
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                    rightSection={isFetching ? <Loader size="xs" /> : null}
                />
                <Stack gap={4} mah={360} style={{ overflowY: 'auto' }}>
                    {results.map((content) => (
                        <Group
                            key={content.uuid}
                            gap="sm"
                            wrap="nowrap"
                            p="xs"
                            style={{ cursor: 'pointer', borderRadius: 8 }}
                            onClick={() => onAdd(toItemRef(content))}
                        >
                            <ResourceIcon
                                item={contentToResourceViewItem(content)}
                            />
                            <Box style={{ flex: 1, minWidth: 0 }}>
                                <Text size="sm" fw={500} truncate>
                                    {content.name}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {content.space?.name}
                                </Text>
                            </Box>
                            <MantineIcon icon={IconPlus} color="gray" />
                        </Group>
                    ))}
                    {results.length === 0 && !isFetching && (
                        <Text size="sm" c="dimmed" p="sm">
                            No matching charts or dashboards.
                        </Text>
                    )}
                </Stack>
            </Stack>
        </MantineModal>
    );
};

export const CollectionBlockView: FC<BlockComponentProps> = ({
    block,
    projectUuid,
}) => {
    const uuids =
        block.type === 'collection'
            ? block.config.items.map((item) => item.uuid)
            : [];
    const { data: contents, isInitialLoading } = useCollectionContent(
        projectUuid,
        uuids,
    );
    if (block.type !== 'collection' || block.config.items.length === 0) {
        return null;
    }
    return (
        <Stack gap="xs">
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                {block.config.title}
            </Text>
            {isInitialLoading ? (
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                    {uuids.slice(0, 3).map((uuid) => (
                        <Skeleton key={uuid} h={72} radius="md" />
                    ))}
                </SimpleGrid>
            ) : (
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                    {(contents ?? []).map((content) => (
                        <ContentCard
                            key={content.uuid}
                            content={content}
                            projectUuid={projectUuid}
                        />
                    ))}
                </SimpleGrid>
            )}
        </Stack>
    );
};

export const CollectionBlockBuild: FC<BuildComponentProps> = ({
    block,
    projectUuid,
    onChange,
}) => {
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const uuids =
        block.type === 'collection'
            ? block.config.items.map((item) => item.uuid)
            : [];
    const { data: contents } = useCollectionContent(projectUuid, uuids);
    const { data: project } = useProject(projectUuid);
    const { data: pinnedItems } = usePinnedItems(
        projectUuid,
        project?.pinnedListUuid,
    );
    if (block.type !== 'collection') return null;

    const importablePins = (pinnedItems ?? []).flatMap(
        (item): HomepageCollectionItemRef[] =>
            item.type === ContentType.CHART ||
            item.type === ContentType.DASHBOARD
                ? [
                      {
                          contentType:
                              item.type === ContentType.DASHBOARD
                                  ? 'dashboard'
                                  : 'chart',
                          uuid: item.data.uuid,
                      },
                  ]
                : [],
    );

    return (
        <Stack gap="xs">
            <TextInput
                aria-label="Collection title"
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
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                {(contents ?? []).map((content) => (
                    <ContentCard
                        key={content.uuid}
                        content={content}
                        projectUuid={projectUuid}
                        onRemove={() =>
                            onChange({
                                ...block,
                                config: {
                                    ...block.config,
                                    items: block.config.items.filter(
                                        (item) => item.uuid !== content.uuid,
                                    ),
                                },
                            })
                        }
                    />
                ))}
                <Button
                    variant="default"
                    h={72}
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={() => setIsPickerOpen(true)}
                >
                    Add content
                </Button>
            </SimpleGrid>
            {block.config.items.length === 0 && importablePins.length > 0 && (
                <Button
                    variant="subtle"
                    size="xs"
                    w="fit-content"
                    leftSection={<MantineIcon icon={IconPin} />}
                    onClick={() =>
                        onChange({
                            ...block,
                            config: {
                                ...block.config,
                                items: importablePins,
                            },
                        })
                    }
                >
                    Import pinned items
                </Button>
            )}
            <CollectionPickerModal
                opened={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                projectUuid={projectUuid}
                selectedUuids={uuids}
                onAdd={(ref) =>
                    onChange({
                        ...block,
                        config: {
                            ...block.config,
                            items: [...block.config.items, ref],
                        },
                    })
                }
            />
        </Stack>
    );
};
