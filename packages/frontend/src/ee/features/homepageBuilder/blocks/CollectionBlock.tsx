import {
    ContentType,
    contentToResourceViewItem,
    ResourceViewItemType,
    type HomepageCollectionItemRef,
    type SummaryContent,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Loader,
    SimpleGrid,
    Skeleton,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconLayoutGrid, IconPin, IconPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { ResourceIcon } from '../../../../components/common/ResourceIcon';
import { useFavoriteMutation } from '../../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../../hooks/favorites/useFavorites';
import { usePinnedItems } from '../../../../hooks/pinning/usePinnedItems';
import { useInfiniteContent } from '../../../../hooks/useContent';
import { useProject } from '../../../../hooks/useProject';
import { useCollectionContent } from '../hooks/useCollectionContent';
import { BlockHeader } from './BlockShell';
import classes from './blockStyles.module.css';
import { ContentCard } from './ContentCard';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const toFavoriteType = (content: SummaryContent) =>
    content.contentType === ContentType.DASHBOARD
        ? ResourceViewItemType.DASHBOARD
        : ResourceViewItemType.CHART;

const toItemRef = (content: SummaryContent): HomepageCollectionItemRef => ({
    contentType:
        content.contentType === ContentType.DASHBOARD ? 'dashboard' : 'chart',
    uuid: content.uuid,
});

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
    const { data: favorites } = useFavorites(projectUuid);
    const { mutate: toggleFavorite } = useFavoriteMutation(projectUuid);
    if (block.type !== 'collection' || block.config.items.length === 0) {
        return null;
    }
    const favoriteUuids = new Set(
        (favorites ?? []).map((item) => item.data.uuid),
    );
    return (
        <Stack gap={0}>
            <BlockHeader icon={IconLayoutGrid} title={block.config.title} />
            {isInitialLoading ? (
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={12}>
                    {uuids.slice(0, 3).map((uuid) => (
                        <Skeleton key={uuid} h={108} radius="md" />
                    ))}
                </SimpleGrid>
            ) : (
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={12}>
                    {(contents ?? []).map((content) => (
                        <ContentCard
                            key={content.uuid}
                            content={content}
                            projectUuid={projectUuid}
                            variant="tile"
                            star={{
                                isFavorite: favoriteUuids.has(content.uuid),
                                onToggle: () =>
                                    toggleFavorite({
                                        contentType: toFavoriteType(content),
                                        contentUuid: content.uuid,
                                    }),
                            }}
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
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={12}>
                {(contents ?? []).map((content) => (
                    <ContentCard
                        key={content.uuid}
                        content={content}
                        projectUuid={projectUuid}
                        variant="tile"
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
                <button
                    type="button"
                    className={classes.addContentTile}
                    onClick={() => setIsPickerOpen(true)}
                >
                    <MantineIcon icon={IconPlus} size={14} />
                    Add content
                </button>
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
