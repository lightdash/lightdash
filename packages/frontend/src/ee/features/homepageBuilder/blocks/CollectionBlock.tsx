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
    collectionLimitOf,
    collectionSourceOf,
    ContentType,
    contentToResourceViewItem,
    isPersonalCollectionSource,
    MAX_COLLECTION_LIMIT,
    ResourceViewItemType,
    type HomepageCollectionBlock,
    type HomepageCollectionItemRef,
    type HomepageCollectionSource,
    type SummaryContent,
} from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Divider,
    Group,
    SegmentedControl,
    Select,
    Skeleton,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine-8/hooks';
import {
    IconFolder,
    IconLayoutGrid,
    IconPin,
    IconPlus,
    IconSearch,
} from '@tabler/icons-react';
import { useMemo, useRef, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { NumberInput } from '../../../../components/common/NumberInput';
import {
    IconBox,
    ResourceIcon,
} from '../../../../components/common/ResourceIcon';
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
import { useCollectionSourceContent } from '../hooks/useCollectionSourceContent';
import { useReportRuntimeEmpty } from '../hooks/useRuntimeEmptyBlocks';
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

// The space itself as a selectable row — adds the space as a card in the
// collection, so spaces don't need their own picker tab.
const SpaceItselfRow: FC<{
    spaceName: string;
    checked: boolean;
    onToggle: () => void;
}> = ({ spaceName, checked, onToggle }) => (
    <Group
        gap="sm"
        wrap="nowrap"
        className={classes.pickerRow}
        onClick={onToggle}
    >
        <Checkbox size="xs" checked={checked} readOnly />
        <IconBox icon={IconFolder} color="violet.6" />
        <Text size="sm" truncate flex={1}>
            {spaceName}
        </Text>
        <Text size="xs" c="dimmed">
            Add the space itself
        </Text>
    </Group>
);

// The right pane: the selected space's charts/dashboards, fetched lazily so
// only the open space ever loads (scales to large projects).
const SpaceContent: FC<{
    projectUuid: string;
    space: { uuid: string; name: string };
    selected: Map<string, HomepageCollectionItemRef>;
    onToggleItem: (content: SummaryContent) => void;
    onToggleMany: (items: SummaryContent[]) => void;
    onToggleSpace: (spaceUuid: string) => void;
}> = ({
    projectUuid,
    space,
    selected,
    onToggleItem,
    onToggleMany,
    onToggleSpace,
}) => {
    const spaceUuid = space.uuid;
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

    const selectedCount = items.filter((content) =>
        selected.has(content.uuid),
    ).length;

    return (
        <Stack gap={2}>
            <SpaceItselfRow
                spaceName={space.name}
                checked={selected.has(spaceUuid)}
                onToggle={() => onToggleSpace(spaceUuid)}
            />
            <Divider my={4} />
            {isFetching && items.length === 0 ? (
                <Stack gap={4} p="xs">
                    <Skeleton h={24} />
                    <Skeleton h={24} />
                    <Skeleton h={24} />
                </Stack>
            ) : items.length === 0 ? (
                <Text size="sm" c="dimmed" p="sm">
                    This space has no charts or dashboards.
                </Text>
            ) : (
                <>
                    <Group gap="sm" wrap="nowrap" className={classes.pickerRow}>
                        <Checkbox
                            size="xs"
                            checked={selectedCount === items.length}
                            indeterminate={
                                selectedCount > 0 &&
                                selectedCount < items.length
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
                </>
            )}
        </Stack>
    );
};

// A flat, search-driven list for a single content type (data apps),
// which — unlike charts/dashboards — aren't naturally browsed by space.
const SearchContentList: FC<{
    projectUuid: string;
    contentType: ContentType.DATA_APP;
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

type PickerTab = 'content' | 'apps';

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
    const selectedSpace = useMemo(() => {
        const match = spaces?.find((space) => space.uuid === selectedSpaceUuid);
        return match ? { uuid: match.uuid, name: match.name } : null;
    }, [spaces, selectedSpaceUuid]);

    const toggleItem = (content: SummaryContent) =>
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(content.uuid)) next.delete(content.uuid);
            else next.set(content.uuid, toItemRef(content));
            return next;
        });

    const toggleSpace = (spaceUuid: string) =>
        setSelected((prev) => {
            const next = new Map(prev);
            if (next.has(spaceUuid)) next.delete(spaceUuid);
            else
                next.set(spaceUuid, {
                    contentType: ContentType.SPACE,
                    uuid: spaceUuid,
                });
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
                            {selectedSpace == null ? (
                                <Text size="sm" c="dimmed" p="sm">
                                    Pick a space on the left to add it, or to
                                    see its charts and dashboards.
                                </Text>
                            ) : (
                                <SpaceContent
                                    key={selectedSpace.uuid}
                                    projectUuid={projectUuid}
                                    space={selectedSpace}
                                    selected={selected}
                                    onToggleItem={toggleItem}
                                    onToggleMany={toggleMany}
                                    onToggleSpace={toggleSpace}
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

const EMPTY_CONFIG: HomepageCollectionBlock['config'] = {
    title: '',
    items: [],
};

const SkeletonGrid: FC<{ itemSpan: number | null }> = ({ itemSpan }) => (
    <PageGrid itemSpan={itemSpan} elastic>
        {[0, 1, 2].map((i) => (
            <PageGridItem key={i}>
                <Skeleton h={108} radius="md" />
            </PageGridItem>
        ))}
    </PageGrid>
);

export const CollectionBlockView: FC<BlockComponentProps> = ({
    itemSpan,
    block,
    projectUuid,
}) => {
    const config = block.type === 'collection' ? block.config : EMPTY_CONFIG;
    const { items: contents, isLoading } = useCollectionSourceContent(
        projectUuid,
        config,
    );
    const { data: favorites } = useFavorites(projectUuid);
    const { mutate: toggleFavorite } = useFavoriteMutation(projectUuid);
    // Emptiness of a dynamic source is only knowable once its data lands, so
    // the page is told rather than inferring it from config.
    useReportRuntimeEmpty(block.id, contents.length === 0, isLoading);
    const favoriteUuids = useMemo(
        () => new Set((favorites ?? []).map((item) => item.data.uuid)),
        [favorites],
    );
    if (block.type !== 'collection') return null;
    // Nothing to show, and nothing on the way: render no header at all. The
    // page drops the row on the next commit.
    if (!isLoading && contents.length === 0) return null;
    return (
        <Stack gap={0}>
            <BlockHeader icon={IconLayoutGrid} title={block.config.title} />
            {isLoading ? (
                <SkeletonGrid itemSpan={itemSpan ?? null} />
            ) : (
                <PageGrid itemSpan={itemSpan ?? null} elastic>
                    {contents.map((content) => {
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

const SOURCE_OPTIONS: {
    value: HomepageCollectionSource;
    label: string;
    hint: string;
}[] = [
    {
        value: 'manual',
        label: 'Hand-picked',
        hint: 'Exactly the items you choose.',
    },
    {
        value: 'most-viewed',
        label: 'Most viewed',
        hint: 'What people in this project actually open.',
    },
    {
        value: 'pinned',
        label: 'Pinned',
        hint: "Follows the project's pin list — new pins appear here.",
    },
    {
        value: 'favorites',
        label: 'Favourites',
        hint: "Each viewer's own favourites.",
    },
    {
        value: 'recently-viewed',
        label: 'Recently viewed',
        hint: "Each viewer's own history.",
    },
    {
        value: 'recently-updated',
        label: 'Recently updated',
        hint: 'Recently changed content. Surfaces churn, not importance.',
    },
];

const CollectionSourceControls: FC<{
    config: HomepageCollectionBlock['config'];
    onChange: (config: HomepageCollectionBlock['config']) => void;
}> = ({ config, onChange }) => {
    const source = collectionSourceOf(config);
    const hint = SOURCE_OPTIONS.find((o) => o.value === source)?.hint;
    return (
        <Stack gap={6}>
            <Select
                size="xs"
                label="Items"
                data={SOURCE_OPTIONS.map(({ value, label }) => ({
                    value,
                    label,
                }))}
                value={source}
                allowDeselect={false}
                onChange={(next) =>
                    next &&
                    onChange({
                        ...config,
                        source: next as HomepageCollectionSource,
                    })
                }
            />
            {hint && (
                <Text size="xs" c="dimmed">
                    {hint}
                </Text>
            )}
            <Group gap="sm" align="flex-end">
                <NumberInput
                    size="xs"
                    label="Show at most"
                    w={120}
                    min={1}
                    max={MAX_COLLECTION_LIMIT}
                    value={collectionLimitOf(config)}
                    onNumberChange={(limit) => onChange({ ...config, limit })}
                />
                <Checkbox
                    size="xs"
                    label="Verified only"
                    checked={config.verifiedOnly === true}
                    onChange={(e) =>
                        onChange({
                            ...config,
                            verifiedOnly: e.currentTarget.checked,
                        })
                    }
                />
            </Group>
        </Stack>
    );
};

// The editor shows what the rule resolves to *for the editing admin*, which is
// the honest preview for project-wide sources. Per-viewer sources say so
// instead of implying everyone sees the admin's favourites.
const DynamicSourcePreview: FC<{
    projectUuid: string;
    config: HomepageCollectionBlock['config'];
    itemSpan: number | null;
}> = ({ projectUuid, config, itemSpan }) => {
    const { items, isLoading } = useCollectionSourceContent(
        projectUuid,
        config,
    );
    const isPersonal = isPersonalCollectionSource(collectionSourceOf(config));
    if (isLoading) {
        return <SkeletonGrid itemSpan={itemSpan} />;
    }
    return (
        <Stack gap={6}>
            {items.length === 0 ? (
                <div className={classes.dashedEmpty}>
                    Nothing matches this rule yet. The block won't render until
                    it does.
                </div>
            ) : (
                <PageGrid itemSpan={itemSpan} elastic>
                    {items.map((content) => (
                        <PageGridItem key={content.uuid}>
                            <ContentCard
                                content={content}
                                projectUuid={projectUuid}
                                variant="tile"
                            />
                        </PageGridItem>
                    ))}
                </PageGrid>
            )}
            <div className={classes.buildHint}>
                {isPersonal
                    ? 'Showing your own items as a sample — every viewer sees their own.'
                    : 'Updates on its own as the project changes.'}
            </div>
        </Stack>
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
    const source = collectionSourceOf(block.config);

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
            <CollectionSourceControls
                config={block.config}
                onChange={(config) => onChange({ ...block, config })}
            />
            {source !== 'manual' ? (
                <DynamicSourcePreview
                    projectUuid={projectUuid}
                    config={block.config}
                    itemSpan={itemSpan ?? null}
                />
            ) : (
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
                                                        item.uuid !==
                                                        content.uuid,
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
            )}
            {source === 'manual' &&
                block.config.items.length === 0 &&
                importablePins.length > 0 && (
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
