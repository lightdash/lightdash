import {
    closestCenter,
    DndContext,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    rectSortingStrategy,
    SortableContext,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    assertUnreachable,
    ContentType,
    contentToResourceViewItem,
    ResourceViewItemType,
    type HomepageCollectionItemRef,
    type SummaryContent,
} from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Divider,
    Group,
    SegmentedControl,
    Skeleton,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconLayoutGrid,
    IconPin,
    IconPlus,
    IconSearch,
} from '@tabler/icons-react';
import { useMemo, useRef, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { ResourceIcon } from '../../../../components/common/ResourceIcon';
import SpaceSelector from '../../../../components/common/SpaceSelector/SpaceSelector';
import { useFavoriteMutation } from '../../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../../hooks/favorites/useFavorites';
import { usePinnedItems } from '../../../../hooks/pinning/usePinnedItems';
import { useInfiniteContent } from '../../../../hooks/useContent';
import { useProject } from '../../../../hooks/useProject';
import { useSpaceSummaries } from '../../../../hooks/useSpaces';
import { reorderCollectionItems } from '../configOps';
import layoutClasses from '../homepageLayout.module.css';
import { useCollectionContent } from '../hooks/useCollectionContent';
import { BlockHeader } from './BlockShell';
import classes from './blockStyles.module.css';
import { ContentCard } from './ContentCard';
import { PageGrid, PageGridItem } from './PageGrid';
import { type BlockComponentProps, type BuildComponentProps } from './types';

// Only charts and dashboards can be favorited — spaces and data apps have no
// favorite toggle, so the star is hidden for them.
const toFavoriteType = (
    content: SummaryContent,
): ResourceViewItemType.CHART | ResourceViewItemType.DASHBOARD | null => {
    switch (content.contentType) {
        case ContentType.CHART:
            return ResourceViewItemType.CHART;
        case ContentType.DASHBOARD:
            return ResourceViewItemType.DASHBOARD;
        case ContentType.SPACE:
        case ContentType.DATA_APP:
            return null;
        default:
            return assertUnreachable(content, 'Unknown collection content');
    }
};

const toItemRef = (content: SummaryContent): HomepageCollectionItemRef => ({
    contentType: content.contentType,
    uuid: content.uuid,
});

type SortKey = 'name' | 'updated' | 'type';

const sortContent = (
    items: SummaryContent[],
    sort: SortKey,
): SummaryContent[] =>
    [...items].sort((a, b) => {
        switch (sort) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'updated':
                return (
                    new Date(b.lastUpdatedAt ?? 0).getTime() -
                    new Date(a.lastUpdatedAt ?? 0).getTime()
                );
            case 'type':
                return (
                    a.contentType.localeCompare(b.contentType) ||
                    a.name.localeCompare(b.name)
                );
            default:
                return assertUnreachable(sort, 'Unknown collection sort');
        }
    });

const PAGE_SIZE = 50;

const ContentRow: FC<{
    content: SummaryContent;
    checked: boolean;
    onToggle: () => void;
}> = ({ content, checked, onToggle }) => (
    <Group
        gap="sm"
        wrap="nowrap"
        className={classes.pickerRow}
        onClick={onToggle}
    >
        <Checkbox size="xs" checked={checked} readOnly />
        <ResourceIcon item={contentToResourceViewItem(content)} />
        <Text size="sm" truncate flex={1}>
            {content.name}
        </Text>
    </Group>
);

// The right pane: the selected space's charts/dashboards, fetched lazily so
// only the open space ever loads (scales to large projects).
const SpaceContent: FC<{
    projectUuid: string;
    spaceUuid: string;
    selected: Map<string, HomepageCollectionItemRef>;
    onToggleItem: (content: SummaryContent) => void;
    onToggleMany: (items: SummaryContent[]) => void;
}> = ({ projectUuid, spaceUuid, selected, onToggleItem, onToggleMany }) => {
    const { data, isFetching, hasNextPage, fetchNextPage, isFetchingNextPage } =
        useInfiniteContent(
            {
                projectUuids: [projectUuid],
                spaceUuids: [spaceUuid],
                contentTypes: [ContentType.CHART, ContentType.DASHBOARD],
                pageSize: PAGE_SIZE,
            },
            { enabled: true, keepPreviousData: true },
        );
    const items = useMemo(
        () =>
            sortContent(
                (data?.pages ?? []).flatMap((page) => page.data),
                'name',
            ),
        [data],
    );

    if (isFetching && items.length === 0) {
        return (
            <Stack gap={4} p="xs">
                <Skeleton h={24} />
                <Skeleton h={24} />
                <Skeleton h={24} />
            </Stack>
        );
    }
    if (items.length === 0) {
        return (
            <Text size="sm" c="dimmed" p="sm">
                This space has no charts or dashboards.
            </Text>
        );
    }
    const selectedCount = items.filter((content) =>
        selected.has(content.uuid),
    ).length;

    return (
        <Stack gap={2}>
            <Group gap="sm" wrap="nowrap" className={classes.pickerRow}>
                <Checkbox
                    size="xs"
                    checked={selectedCount === items.length}
                    indeterminate={
                        selectedCount > 0 && selectedCount < items.length
                    }
                    onChange={() => onToggleMany(items)}
                />
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                    Select all ({items.length})
                </Text>
            </Group>
            {items.map((content) => (
                <ContentRow
                    key={content.uuid}
                    content={content}
                    checked={selected.has(content.uuid)}
                    onToggle={() => onToggleItem(content)}
                />
            ))}
            {hasNextPage && (
                <Button
                    variant="subtle"
                    size="xs"
                    w="fit-content"
                    loading={isFetchingNextPage}
                    onClick={() => void fetchNextPage()}
                >
                    Load more
                </Button>
            )}
        </Stack>
    );
};

// A flat, search-driven list for a single content type (data apps or spaces),
// which — unlike charts/dashboards — aren't naturally browsed by space.
const SearchContentList: FC<{
    projectUuid: string;
    contentType: ContentType.DATA_APP | ContentType.SPACE;
    placeholder: string;
    emptyLabel: string;
    selected: Map<string, HomepageCollectionItemRef>;
    onToggleItem: (content: SummaryContent) => void;
}> = ({
    projectUuid,
    contentType,
    placeholder,
    emptyLabel,
    selected,
    onToggleItem,
}) => {
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const { data, isFetching, hasNextPage, fetchNextPage, isFetchingNextPage } =
        useInfiniteContent(
            {
                projectUuids: [projectUuid],
                contentTypes: [contentType],
                pageSize: PAGE_SIZE,
                search: debouncedSearch || undefined,
            },
            { keepPreviousData: true },
        );
    const items = useMemo(
        () => (data?.pages ?? []).flatMap((page) => page.data),
        [data],
    );

    return (
        <Stack gap="xs" flex={1} miw={0}>
            <TextInput
                size="xs"
                placeholder={placeholder}
                leftSection={<MantineIcon icon={IconSearch} size={14} />}
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                autoFocus
            />
            <Box flex={1} miw={0} className={classes.pickerScrollList}>
                {isFetching && items.length === 0 ? (
                    <Stack gap={4} p="xs">
                        <Skeleton h={24} />
                        <Skeleton h={24} />
                        <Skeleton h={24} />
                    </Stack>
                ) : items.length === 0 ? (
                    <Text size="sm" c="dimmed" p="sm">
                        {emptyLabel}
                    </Text>
                ) : (
                    <Stack gap={2}>
                        {items.map((content) => (
                            <ContentRow
                                key={content.uuid}
                                content={content}
                                checked={selected.has(content.uuid)}
                                onToggle={() => onToggleItem(content)}
                            />
                        ))}
                        {hasNextPage && (
                            <Button
                                variant="subtle"
                                size="xs"
                                w="fit-content"
                                loading={isFetchingNextPage}
                                onClick={() => void fetchNextPage()}
                            >
                                Load more
                            </Button>
                        )}
                    </Stack>
                )}
            </Box>
        </Stack>
    );
};

type PickerTab = 'content' | 'apps' | 'spaces';

const CollectionPicker: FC<{
    projectUuid: string;
    initialSelected: HomepageCollectionItemRef[];
    onApply: (refs: HomepageCollectionItemRef[]) => void;
    /** Hands the modal's Apply button a callback that commits the current
     * selection — the footer lives in MantineModal, outside this component. */
    registerApply: (commit: () => void) => void;
}> = ({ projectUuid, initialSelected, onApply, registerApply }) => {
    const [tab, setTab] = useState<PickerTab>('content');
    const [selectedSpaceUuid, setSelectedSpaceUuid] = useState<string | null>(
        null,
    );
    const [selected, setSelected] = useState<
        Map<string, HomepageCollectionItemRef>
    >(() => new Map(initialSelected.map((ref) => [ref.uuid, ref])));

    // Re-point the parent's apply ref every render so it always commits the
    // latest selection (idempotent, so safe during render — no effect needed).
    registerApply(() => onApply([...selected.values()]));

    const { data: spaces } = useSpaceSummaries(projectUuid, true);

    const toggleItem = (content: SummaryContent) =>
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(content.uuid)) next.delete(content.uuid);
            else next.set(content.uuid, toItemRef(content));
            return next;
        });

    const toggleMany = (items: SummaryContent[]) =>
        setSelected((prev) => {
            const next = new Map(prev);
            const allSelected = items.every((content) =>
                next.has(content.uuid),
            );
            items.forEach((content) => {
                if (allSelected) next.delete(content.uuid);
                else next.set(content.uuid, toItemRef(content));
            });
            return next;
        });

    return (
        <Stack gap="sm">
            <Group justify="space-between" gap="sm" wrap="nowrap">
                <SegmentedControl
                    size="xs"
                    value={tab}
                    onChange={(value) => setTab(value as PickerTab)}
                    data={[
                        { label: 'Charts & dashboards', value: 'content' },
                        { label: 'Data apps', value: 'apps' },
                        { label: 'Spaces', value: 'spaces' },
                    ]}
                />
                <Text size="sm" c="dimmed">
                    {selected.size} selected
                </Text>
            </Group>
            <Box h="min(64vh, 720px)">
                {tab === 'content' && (
                    <Group align="stretch" gap="md" wrap="nowrap" h="100%">
                        <Box w={340} className={classes.pickerScrollList}>
                            <SpaceSelector
                                projectUuid={projectUuid}
                                spaces={spaces}
                                selectedSpaceUuid={selectedSpaceUuid}
                                onSelectSpace={setSelectedSpaceUuid}
                                itemType={undefined}
                                isRootSelectionEnabled={false}
                            />
                        </Box>
                        <Divider orientation="vertical" />
                        <Box
                            flex={1}
                            miw={0}
                            className={classes.pickerScrollList}
                        >
                            {selectedSpaceUuid == null ? (
                                <Text size="sm" c="dimmed" p="sm">
                                    Pick a space on the left to see its charts
                                    and dashboards.
                                </Text>
                            ) : (
                                <SpaceContent
                                    key={selectedSpaceUuid}
                                    projectUuid={projectUuid}
                                    spaceUuid={selectedSpaceUuid}
                                    selected={selected}
                                    onToggleItem={toggleItem}
                                    onToggleMany={toggleMany}
                                />
                            )}
                        </Box>
                    </Group>
                )}
                {tab === 'apps' && (
                    <SearchContentList
                        projectUuid={projectUuid}
                        contentType={ContentType.DATA_APP}
                        placeholder="Search data apps..."
                        emptyLabel="No data apps found."
                        selected={selected}
                        onToggleItem={toggleItem}
                    />
                )}
                {tab === 'spaces' && (
                    <SearchContentList
                        projectUuid={projectUuid}
                        contentType={ContentType.SPACE}
                        placeholder="Search spaces..."
                        emptyLabel="No spaces found."
                        selected={selected}
                        onToggleItem={toggleItem}
                    />
                )}
            </Box>
        </Stack>
    );
};

const CollectionPickerModal: FC<{
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    initialSelected: HomepageCollectionItemRef[];
    onApply: (refs: HomepageCollectionItemRef[]) => void;
}> = ({ opened, onClose, projectUuid, initialSelected, onApply }) => {
    // The Apply/Cancel footer is MantineModal's own — it lives outside the
    // remountable picker body, so the picker hands its commit fn up via ref
    // rather than rendering a duplicate footer inline.
    const applyRef = useRef<() => void>(() => {});
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Add content"
            icon={IconPlus}
            size="min(92vw, 1280px)"
            confirmLabel="Apply"
            onConfirm={() => {
                applyRef.current();
                onClose();
            }}
        >
            {opened && (
                <CollectionPicker
                    projectUuid={projectUuid}
                    initialSelected={initialSelected}
                    onApply={onApply}
                    registerApply={(fn) => {
                        applyRef.current = fn;
                    }}
                />
            )}
        </MantineModal>
    );
};

export const CollectionBlockView: FC<BlockComponentProps> = ({
    itemSpan,
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
                <PageGrid itemSpan={itemSpan ?? null} elastic>
                    {uuids.slice(0, 3).map((uuid) => (
                        <PageGridItem key={uuid}>
                            <Skeleton h={108} radius="md" />
                        </PageGridItem>
                    ))}
                </PageGrid>
            ) : (
                <PageGrid itemSpan={itemSpan ?? null} elastic>
                    {(contents ?? []).map((content) => {
                        const favoriteType = toFavoriteType(content);
                        return (
                            <PageGridItem key={content.uuid}>
                                <ContentCard
                                    content={content}
                                    projectUuid={projectUuid}
                                    variant="tile"
                                    star={
                                        favoriteType
                                            ? {
                                                  isFavorite: favoriteUuids.has(
                                                      content.uuid,
                                                  ),
                                                  onToggle: () =>
                                                      toggleFavorite({
                                                          contentType:
                                                              favoriteType,
                                                          contentUuid:
                                                              content.uuid,
                                                      }),
                                              }
                                            : undefined
                                    }
                                />
                            </PageGridItem>
                        );
                    })}
                </PageGrid>
            )}
        </Stack>
    );
};

// Whole tile is the drag surface: build-mode tiles aren't links, and the 5px
// activation distance keeps the remove button clickable.
const SortableTile: FC<{
    content: SummaryContent;
    projectUuid: string;
    onRemove: () => void;
}> = ({ content, projectUuid, onRemove }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: content.uuid });
    return (
        <div
            ref={setNodeRef}
            className={`${classes.sortableTile} ${layoutClasses.pageGridItem}`}
            data-dragging={isDragging}
            style={{
                transform: CSS.Translate.toString(transform),
                transition,
            }}
            {...attributes}
            {...listeners}
        >
            <ContentCard
                content={content}
                projectUuid={projectUuid}
                variant="tile"
                onRemove={onRemove}
            />
        </div>
    );
};

export const CollectionBlockBuild: FC<BuildComponentProps> = ({
    itemSpan,
    block,
    projectUuid,
    onChange,
}) => {
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    );
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

    const importablePins = (pinnedItems ?? []).map(
        (item): HomepageCollectionItemRef => ({
            contentType: item.type,
            uuid: item.data.uuid,
        }),
    );

    return (
        <Stack gap="xs">
            <TextInput
                label="Title"
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
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event: DragEndEvent) => {
                    const { active, over } = event;
                    if (!over || active.id === over.id) return;
                    onChange({
                        ...block,
                        config: {
                            ...block.config,
                            items: reorderCollectionItems(
                                block.config.items,
                                String(active.id),
                                String(over.id),
                            ),
                        },
                    });
                }}
            >
                <SortableContext
                    items={(contents ?? []).map((content) => content.uuid)}
                    strategy={rectSortingStrategy}
                >
                    <PageGrid itemSpan={itemSpan ?? null} elastic>
                        {(contents ?? []).map((content) => (
                            <SortableTile
                                key={content.uuid}
                                content={content}
                                projectUuid={projectUuid}
                                onRemove={() =>
                                    onChange({
                                        ...block,
                                        config: {
                                            ...block.config,
                                            items: block.config.items.filter(
                                                (item) =>
                                                    item.uuid !== content.uuid,
                                            ),
                                        },
                                    })
                                }
                            />
                        ))}
                        <PageGridItem>
                            <button
                                type="button"
                                className={classes.addContentTile}
                                onClick={() => setIsPickerOpen(true)}
                            >
                                <MantineIcon icon={IconPlus} size={14} />
                                Add content
                            </button>
                        </PageGridItem>
                    </PageGrid>
                </SortableContext>
            </DndContext>
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
                initialSelected={block.config.items}
                onApply={(refs) =>
                    onChange({
                        ...block,
                        config: { ...block.config, items: refs },
                    })
                }
            />
        </Stack>
    );
};
