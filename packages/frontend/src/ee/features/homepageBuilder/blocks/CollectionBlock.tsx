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
    ContentType,
    contentToResourceViewItem,
    ResourceViewItemType,
    type HomepageCollectionItemRef,
    type SummaryContent,
} from '@lightdash/common';
import {
    Button,
    type ComboboxItem,
    type ComboboxLikeRenderOptionInput,
    Group,
    Loader,
    MultiSelect,
    Skeleton,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine-8/hooks';
import { IconLayoutGrid, IconPin, IconPlus } from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { ResourceIcon } from '../../../../components/common/ResourceIcon';
import { useFavoriteMutation } from '../../../../hooks/favorites/useFavoriteMutation';
import { useFavorites } from '../../../../hooks/favorites/useFavorites';
import { usePinnedItems } from '../../../../hooks/pinning/usePinnedItems';
import { useInfiniteContent } from '../../../../hooks/useContent';
import { useProject } from '../../../../hooks/useProject';
import { reorderCollectionItems } from '../configOps';
import { useCollectionContent } from '../hooks/useCollectionContent';
import { BlockHeader } from './BlockShell';
import classes from './blockStyles.module.css';
import {
    buildSelectionRefs,
    groupContentBySpace,
} from './collectionPickerUtils';
import { ContentCard } from './ContentCard';
import { type BlockComponentProps, type BuildComponentProps } from './types';

const toFavoriteType = (content: SummaryContent) =>
    content.contentType === ContentType.DASHBOARD
        ? ResourceViewItemType.DASHBOARD
        : ResourceViewItemType.CHART;

const PICKER_PAGE_SIZE = 50;

const CollectionPickerMultiSelect: FC<{
    projectUuid: string;
    initialSelected: HomepageCollectionItemRef[];
    onApply: (refs: HomepageCollectionItemRef[]) => void;
    /** Hands the modal's Apply button a callback that commits the current
     * selection — the footer lives in MantineModal, outside this component. */
    registerApply: (commit: () => void) => void;
}> = ({ projectUuid, initialSelected, onApply, registerApply }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
    const viewportRef = useRef<HTMLDivElement>(null);

    const initialUuids = useMemo(
        () => initialSelected.map((ref) => ref.uuid),
        [initialSelected],
    );
    const { data: initialContent } = useCollectionContent(
        projectUuid,
        initialUuids,
    );

    const {
        data: contentPages,
        isFetching,
        hasNextPage,
        fetchNextPage,
    } = useInfiniteContent(
        {
            projectUuids: [projectUuid],
            contentTypes: [ContentType.CHART, ContentType.DASHBOARD],
            search: debouncedSearchQuery,
            pageSize: PICKER_PAGE_SIZE,
        },
        { keepPreviousData: true },
    );

    const [contentMap, setContentMap] = useState<Map<string, SummaryContent>>(
        () => new Map(),
    );

    useEffect(() => {
        const pages = contentPages?.pages.flatMap((page) => page.data) ?? [];
        if (pages.length === 0) return;
        setContentMap((prev) => {
            const next = new Map(prev);
            pages.forEach((content) => next.set(content.uuid, content));
            return next;
        });
    }, [contentPages?.pages]);

    useEffect(() => {
        if (!initialContent || initialContent.length === 0) return;
        setContentMap((prev) => {
            const next = new Map(prev);
            initialContent.forEach((content) =>
                next.set(content.uuid, content),
            );
            return next;
        });
    }, [initialContent]);

    const [selected, setSelected] = useState<
        Map<string, HomepageCollectionItemRef>
    >(() => new Map(initialSelected.map((ref) => [ref.uuid, ref])));

    // Re-point the parent's apply ref every render so it always commits the
    // latest selection (idempotent, so safe during render — no effect needed).
    registerApply(() => onApply([...selected.values()]));

    const handleChange = (newUuids: string[]) => {
        setSelected((prev) => buildSelectionRefs(newUuids, prev, contentMap));
    };

    const visibleUuids = useMemo(() => {
        const pageUuids =
            contentPages?.pages.flatMap((page) =>
                page.data.map((content) => content.uuid),
            ) ?? [];
        return new Set([...pageUuids, ...selected.keys()]);
    }, [contentPages?.pages, selected]);

    const data = useMemo(() => {
        const visibleContent = new Map(
            [...contentMap].filter(([uuid]) => visibleUuids.has(uuid)),
        );
        return groupContentBySpace(visibleContent);
    }, [contentMap, visibleUuids]);

    const renderOption = useCallback(
        ({ option }: ComboboxLikeRenderOptionInput<ComboboxItem>) => {
            const content = contentMap.get(option.value);
            if (!content) return option.label;
            return (
                <Group gap="sm" wrap="nowrap">
                    <ResourceIcon item={contentToResourceViewItem(content)} />
                    <Text size="sm" truncate>
                        {content.name}
                    </Text>
                </Group>
            );
        },
        [contentMap],
    );

    const handleScrollPositionChange = useCallback(
        ({ y }: { x: number; y: number }) => {
            if (!viewportRef.current || isFetching || !hasNextPage) return;
            const { scrollHeight, clientHeight } = viewportRef.current;
            if (scrollHeight <= clientHeight) return;
            const isNearBottom = y >= scrollHeight - clientHeight - 50;
            if (isNearBottom) void fetchNextPage();
        },
        [isFetching, hasNextPage, fetchNextPage],
    );

    return (
        <Stack gap="xs">
            <Text size="sm" c="dimmed">
                {selected.size} selected
            </Text>
            <MultiSelect
                placeholder="Search charts and dashboards..."
                searchable
                clearable
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                value={[...selected.keys()]}
                onChange={handleChange}
                data={data}
                renderOption={renderOption}
                maxDropdownHeight={300}
                nothingFoundMessage="No charts or dashboards found"
                rightSection={isFetching ? <Loader size="xs" /> : null}
                scrollAreaProps={{
                    viewportRef,
                    onScrollPositionChange: handleScrollPositionChange,
                }}
                filter={({ options }) => options}
            />
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
            size="lg"
            confirmLabel="Apply"
            onConfirm={() => {
                applyRef.current();
                onClose();
            }}
        >
            {opened && (
                <CollectionPickerMultiSelect
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
    // A partial row centres its cards, so centre the header with them — the
    // whole block reads as one unit instead of a left-anchored orphan title.
    const cardCount = (contents ?? uuids).length;
    return (
        <Stack gap={0}>
            <BlockHeader
                icon={IconLayoutGrid}
                title={block.config.title}
                centered={cardCount > 0 && cardCount < 3}
            />
            {isInitialLoading ? (
                <div className={classes.hugGrid}>
                    {uuids.slice(0, 3).map((uuid) => (
                        <div key={uuid} className={classes.hugGridItem}>
                            <Skeleton h={108} radius="md" />
                        </div>
                    ))}
                </div>
            ) : (
                <div className={classes.hugGrid}>
                    {(contents ?? []).map((content) => (
                        <div key={content.uuid} className={classes.hugGridItem}>
                            <ContentCard
                                content={content}
                                projectUuid={projectUuid}
                                variant="tile"
                                star={{
                                    isFavorite: favoriteUuids.has(content.uuid),
                                    onToggle: () =>
                                        toggleFavorite({
                                            contentType:
                                                toFavoriteType(content),
                                            contentUuid: content.uuid,
                                        }),
                                }}
                            />
                        </div>
                    ))}
                </div>
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
            className={`${classes.sortableTile} ${classes.hugGridItem}`}
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
                    <div className={classes.hugGrid}>
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
                        <div className={classes.hugGridItem}>
                            <button
                                type="button"
                                className={classes.addContentTile}
                                onClick={() => setIsPickerOpen(true)}
                            >
                                <MantineIcon icon={IconPlus} size={14} />
                                Add content
                            </button>
                        </div>
                    </div>
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
