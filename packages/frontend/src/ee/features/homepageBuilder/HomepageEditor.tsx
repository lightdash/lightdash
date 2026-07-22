import {
    closestCorners,
    DndContext,
    DragOverlay,
    MeasuringStrategy,
    PointerSensor,
    pointerWithin,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type CollisionDetection,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import {
    horizontalListSortingStrategy,
    SortableContext,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    migrateHomepageConfig,
    type HomepageBlock,
    type HomepageConfig,
    type HomepageViewAsTarget,
    type ProjectHomepage as ProjectHomepageType,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Menu,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconArrowBackUp,
    IconArrowDown,
    IconArrowLeft,
    IconArrowRight,
    IconArrowUp,
    IconCheck,
    IconChevronDown,
    IconCircleCheck,
    IconCopy,
    IconEye,
    IconGripVertical,
    IconPencil,
    IconPlus,
    IconTrash,
    IconUsers,
} from '@tabler/icons-react';
import isEqual from 'lodash/isEqual';
import { Fragment, useEffect, useMemo, useRef, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useAiAgentButtonVisibility } from '../aiCopilot/hooks/useAiAgentsButtonVisibility';
import { TIER_CLASS, traitFor } from './blockLayout';
import { IconSquare } from './blocks/BlockShell';
import {
    blockLibrary,
    getBlockDefinition,
    type BlockDefinition,
} from './blocks/registry';
import {
    addBlock,
    canAddColumn,
    canDropInRow,
    canPlaceBlockInRow,
    canMoveDown,
    canMoveUp,
    dropExistingBlock,
    dropNewBlock,
    duplicateBlock,
    moveBlockDown,
    moveBlockUp,
    removeBlock,
    replaceBlock,
    type DropTarget,
} from './configOps';
import classes from './HomepageEditor.module.css';
import layout from './homepageLayout.module.css';
import {
    useDeleteHomepage,
    useDiscardHomepageDraft,
    usePublishHomepage,
    useUpdateHomepageDraft,
} from './hooks/useProjectHomepage';
import {
    PreviewPane,
    ViewAsControl,
    type HomepageViewType,
} from './PreviewPane';
import { PublishModal } from './PublishModal';
import { resolveHomepageLayout } from './resolveHomepageLayout';

type DragSource =
    | { kind: 'new'; definition: BlockDefinition }
    | { kind: 'existing'; blockId: string; definition: BlockDefinition };

const END_ZONE_ID = 'end';
const gapZoneId = (rowIndex: number) => `gap:${rowIndex}`;

const locateBlock = (
    config: HomepageConfig,
    blockId: string,
): { rowIndex: number; blockIndex: number } | undefined => {
    for (let rowIndex = 0; rowIndex < config.rows.length; rowIndex += 1) {
        const blockIndex = config.rows[rowIndex].blocks.findIndex(
            (block) => block.id === blockId,
        );
        if (blockIndex >= 0) return { rowIndex, blockIndex };
    }
    return undefined;
};

// Prefer the zone the pointer is literally within; corners as a fallback so
// the thin row gaps stay reachable while dragging fast.
const collisionDetectionStrategy: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length > 0
        ? pointerCollisions
        : closestCorners(args);
};

const LibraryCard: FC<{ definition: BlockDefinition; onAdd: () => void }> = ({
    definition,
    onAdd,
}) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `library:${definition.type}`,
        data: { kind: 'new', definition } satisfies DragSource,
    });
    return (
        <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            className={classes.railCard}
            data-dragging={isDragging}
            onClick={onAdd}
        >
            <IconSquare icon={definition.icon} />
            <Box miw={0}>
                <div className={classes.railCardLabel}>{definition.label}</div>
                <div className={classes.railCardDesc}>
                    {definition.description}
                </div>
            </Box>
        </div>
    );
};

const RowGap: FC<{
    rowIndex: number;
    isDragActive: boolean;
    active: boolean;
    blocks: BlockDefinition[];
    onQuickAdd: (definition: BlockDefinition) => void;
}> = ({ rowIndex, isDragActive, active, blocks, onQuickAdd }) => {
    const { setNodeRef } = useDroppable({ id: gapZoneId(rowIndex) });
    const [menuOpened, setMenuOpened] = useState(false);
    return (
        <div
            ref={setNodeRef}
            className={classes.rowDropZone}
            data-drag-active={isDragActive}
            data-menu-open={menuOpened}
        >
            <div className={classes.dropLine} data-over={active} />
            {!isDragActive && (
                <div className={classes.gapAdd}>
                    <div className={classes.gapAddLine} />
                    <Menu
                        opened={menuOpened}
                        onChange={setMenuOpened}
                        position="bottom"
                        width={240}
                    >
                        <Menu.Target>
                            <button type="button" className={classes.gapAddBtn}>
                                <MantineIcon icon={IconPlus} size={13} />
                                Add block
                            </button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            {blocks.map((definition) => (
                                <Menu.Item
                                    key={definition.type}
                                    leftSection={
                                        <MantineIcon
                                            icon={definition.icon}
                                            color="ldGray.6"
                                        />
                                    }
                                    onClick={() => onQuickAdd(definition)}
                                >
                                    {definition.label}
                                </Menu.Item>
                            ))}
                        </Menu.Dropdown>
                    </Menu>
                    <div className={classes.gapAddLine} />
                </div>
            )}
        </div>
    );
};

const EndDropZone: FC<{ isEmpty: boolean; active: boolean }> = ({
    isEmpty,
    active,
}) => {
    const { setNodeRef } = useDroppable({ id: END_ZONE_ID });
    return (
        <div
            ref={setNodeRef}
            className={
                active
                    ? `${classes.endZone} ${classes.endZoneActive}`
                    : classes.endZone
            }
        >
            <MantineIcon
                icon={IconPlus}
                size={15}
                className={classes.endZoneIcon}
            />
            {isEmpty
                ? 'No blocks yet — click or drag one from the library.'
                : 'Drag a block here, or click one in the library.'}
        </div>
    );
};

// The gutters around/between blocks in a row are where columns are added
// deliberately. Idle: a slim "+" rail (revealed on row hover) that opens the
// block menu. During a drag: a dashed drop slot that accepts the dragged block
// as a new column. Both emit `slot:<rowIndex>:<insertIndex>` drop ids.
const ColumnGutter: FC<{
    rowIndex: number;
    insertIndex: number;
    isDragActive: boolean;
    active: boolean;
    blocks: BlockDefinition[];
    onAdd: (definition: BlockDefinition) => void;
}> = ({ rowIndex, insertIndex, isDragActive, active, blocks, onAdd }) => {
    const { setNodeRef } = useDroppable({
        id: `slot:${rowIndex}:${insertIndex}`,
        disabled: !isDragActive,
    });
    const [menuOpened, setMenuOpened] = useState(false);

    if (isDragActive) {
        return (
            <div
                ref={setNodeRef}
                className={classes.columnSlot}
                data-over={active}
            >
                <MantineIcon icon={IconPlus} size={14} />
            </div>
        );
    }
    return (
        <div className={classes.columnRail} data-menu-open={menuOpened}>
            <Menu
                opened={menuOpened}
                onChange={setMenuOpened}
                position="bottom"
                width={240}
            >
                <Menu.Target>
                    <button
                        type="button"
                        className={classes.columnRailBtn}
                        aria-label="Add column"
                    >
                        <MantineIcon icon={IconPlus} size={18} />
                    </button>
                </Menu.Target>
                <Menu.Dropdown>
                    {blocks.map((definition) => (
                        <Menu.Item
                            key={definition.type}
                            leftSection={
                                <MantineIcon
                                    icon={definition.icon}
                                    color="ldGray.6"
                                />
                            }
                            onClick={() => onAdd(definition)}
                        >
                            {definition.label}
                        </Menu.Item>
                    ))}
                </Menu.Dropdown>
            </Menu>
        </div>
    );
};

// Thin vertical insertion marker shown between columns while dragging.
const ColIndicator: FC<{ active: boolean }> = ({ active }) => (
    <div className={classes.colIndicator} data-over={active} />
);

// A translucent preview of the block, shown in the layout exactly where the
// drop will land — held until release.
const GhostBlock: FC<{ definition: BlockDefinition }> = ({ definition }) => (
    <div className={classes.ghostBlock}>
        <IconSquare icon={definition.icon} />
        <span className={classes.ghostBlockLabel}>{definition.label}</span>
    </div>
);

type BlockCardProps = {
    block: HomepageBlock;
    definition: BlockDefinition;
    projectUuid: string;
    canUp: boolean;
    canDown: boolean;
    onUp: () => void;
    onDown: () => void;
    onDuplicate: () => void;
    onRemove: () => void;
    onChange: (updated: HomepageBlock) => void;
    justPlaced: boolean;
    itemSpan: number | null;
};

const BlockCard: FC<BlockCardProps> = ({
    block,
    definition,
    projectUuid,
    canUp,
    canDown,
    onUp,
    onDown,
    onDuplicate,
    onRemove,
    onChange,
    justPlaced,
    itemSpan,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: block.id,
        data: {
            kind: 'existing',
            blockId: block.id,
            definition,
        } satisfies DragSource,
    });
    const { Build } = definition;
    return (
        <div
            ref={setNodeRef}
            className={classes.blockChrome}
            data-dragging={isDragging}
            data-just-placed={justPlaced}
            style={{
                transform: CSS.Translate.toString(transform),
                transition,
            }}
        >
            <Group gap={4} mb="xs" justify="space-between" wrap="nowrap">
                <div
                    className={classes.blockDragArea}
                    {...attributes}
                    {...listeners}
                    aria-label={`Drag ${definition.label} block`}
                >
                    <span className={classes.blockHandle}>
                        <MantineIcon icon={IconGripVertical} color="ldGray.6" />
                    </span>
                    <span className={classes.blockTypeLabel}>
                        {definition.label}
                    </span>
                </div>
                <Group gap={2} className={classes.blockActions} wrap="nowrap">
                    <Tooltip label="Move up">
                        <ActionIcon
                            variant="subtle"
                            color="ldGray.6"
                            disabled={!canUp}
                            onClick={onUp}
                        >
                            <MantineIcon icon={IconArrowUp} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Move down">
                        <ActionIcon
                            variant="subtle"
                            color="ldGray.6"
                            disabled={!canDown}
                            onClick={onDown}
                        >
                            <MantineIcon icon={IconArrowDown} />
                        </ActionIcon>
                    </Tooltip>
                    {!definition.singleton && (
                        <Tooltip label="Duplicate">
                            <ActionIcon
                                variant="subtle"
                                color="ldGray.6"
                                onClick={onDuplicate}
                            >
                                <MantineIcon icon={IconCopy} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                    <Tooltip label="Remove">
                        <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={onRemove}
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>
            <Build
                block={block}
                projectUuid={projectUuid}
                onChange={onChange}
                itemSpan={itemSpan}
            />
        </div>
    );
};

type Props = {
    homepage: ProjectHomepageType;
    projectUuid: string;
    homepages: ProjectHomepageType[];
    onSwitchHomepage: (homepageUuid: string) => void;
    onCreateNew: () => void;
    onDeleted: () => void;
    onReload: () => void;
};

export const HomepageEditor: FC<Props> = ({
    homepage,
    projectUuid,
    homepages,
    onSwitchHomepage,
    onCreateNew,
    onDeleted,
    onReload,
}) => {
    const navigate = useNavigate();
    const updateMutation = useUpdateHomepageDraft(
        projectUuid,
        homepage.homepageUuid,
    );
    const publishMutation = usePublishHomepage(
        projectUuid,
        homepage.homepageUuid,
    );
    const deleteMutation = useDeleteHomepage(projectUuid);
    const discardDraftMutation = useDiscardHomepageDraft(
        projectUuid,
        homepage.homepageUuid,
    );
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);

    const isAiEnabled = useAiAgentButtonVisibility();

    const [draft, setDraft] = useState<HomepageConfig>(() =>
        migrateHomepageConfig(homepage.draftConfig),
    );
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [viewType, setViewType] = useState<HomepageViewType>('everyone');
    const [viewTarget, setViewTarget] = useState<HomepageViewAsTarget | null>(
        null,
    );
    const togglePreview = () => {
        setIsPreviewing((prev) => !prev);
        setViewType('everyone');
        setViewTarget(null);
    };
    const [debouncedDraft] = useDebouncedValue(draft, 800);
    const [hasConflict, setHasConflict] = useState(false);
    // Share the exact initial draft reference so the autosave effect's identity
    // check sees no change on mount (avoids a spurious save on every load).
    const lastSavedRef = useRef<HomepageConfig>(draft);
    // Compare-and-set token so a stale editor can never clobber newer state
    const baseUpdatedAtRef = useRef<Date>(homepage.updatedAt);

    // WYSIWYG: the canvas adopts the published layout's geometry. Build
    // surface keeps rows/blocks 1:1 with the draft, so indexes line up.
    const resolvedRows = useMemo(
        () => resolveHomepageLayout(draft, { surface: 'build' }).rows,
        [draft],
    );

    const [activeDrag, setActiveDrag] = useState<DragSource | null>(null);
    // Where the drop will land, shown as an insertion indicator. The real
    // layout stays frozen during the drag; nothing moves until the drop.
    const [dropIndicator, setDropIndicator] = useState<DropTarget | null>(null);
    // Block just placed by a drop, for its entrance animation.
    const [justPlacedId, setJustPlacedId] = useState<string | null>(null);

    // Singleton blocks (e.g. metrics) drop out of the library once placed.
    const usedSingletonTypes = new Set(
        draft.rows.flatMap((row) => row.blocks).map((block) => block.type),
    );
    const availableBlocks = blockLibrary.filter(
        (definition) =>
            (!definition.requiresAi || isAiEnabled) &&
            !(definition.singleton && usedSingletonTypes.has(definition.type)),
    );
    // Full-row blocks never appear in into-row (column) menus.
    const columnBlocks = availableBlocks.filter(
        (definition) => !traitFor(definition.type).fullRowOnly,
    );

    const { mutate: saveDraft } = updateMutation;
    useEffect(() => {
        // never autosave mid-drag: the layout is a transient preview
        if (
            hasConflict ||
            activeDrag !== null ||
            debouncedDraft === lastSavedRef.current
        ) {
            return;
        }
        lastSavedRef.current = debouncedDraft;
        saveDraft(
            {
                draftConfig: debouncedDraft,
                baseUpdatedAt: baseUpdatedAtRef.current,
            },
            {
                onSuccess: (saved) => {
                    baseUpdatedAtRef.current = saved.updatedAt;
                },
                onError: (error) => {
                    if (error.error.statusCode === 409) setHasConflict(true);
                },
            },
        );
    }, [debouncedDraft, hasConflict, activeDrag, saveDraft]);

    const handleOpenPublish = async () => {
        if (hasConflict) return;
        if (draft !== lastSavedRef.current) {
            lastSavedRef.current = draft;
            try {
                const saved = await updateMutation.mutateAsync(
                    {
                        draftConfig: draft,
                        baseUpdatedAt: baseUpdatedAtRef.current,
                    },
                    {
                        onError: (error) => {
                            if (error.error.statusCode === 409) {
                                setHasConflict(true);
                            }
                        },
                    },
                );
                baseUpdatedAtRef.current = saved.updatedAt;
            } catch {
                return;
            }
        }
        setIsPublishModalOpen(true);
    };

    const handleDiscardDraft = () => {
        discardDraftMutation.mutate(undefined, {
            // Remount from the reverted server state instead of patching local
            // state — a stale debounced draft would otherwise re-save over it.
            onSuccess: () => {
                setIsDiscardModalOpen(false);
                onReload();
            },
        });
    };

    const isDirty = draft !== lastSavedRef.current || updateMutation.isLoading;

    // Only offer a revert when the draft actually diverges from what's live —
    // reverting to an identical published version is a no-op.
    const publishedConfig = useMemo(
        () =>
            homepage.publishedConfig
                ? migrateHomepageConfig(homepage.publishedConfig)
                : null,
        [homepage.publishedConfig],
    );
    const canRevertToPublished =
        publishedConfig !== null && !isEqual(draft, publishedConfig);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    );

    // Dragging is reorder-only: dropping on a block moves the dragged block to
    // a new row above/below it. It never splits two blocks into a shared row —
    // columns are created deliberately via the explicit gutter affordance
    // (rail click / drop slot, which emit `slot:` ids). The one exception is
    // reordering columns *within* the dragged block's own multi-block row.
    const computeTarget = (
        config: HomepageConfig,
        event: DragOverEvent | DragEndEvent,
        source: DragSource,
    ): DropTarget | null => {
        const draggedBlockId =
            source.kind === 'existing' ? source.blockId : null;
        // Cell targets the guards would refuse are not advertised at all.
        const legalise = (target: DropTarget): DropTarget | null =>
            target.kind === 'cell' &&
            !canPlaceBlockInRow(
                config,
                target.rowIndex,
                source.definition.type,
                draggedBlockId ?? undefined,
            )
                ? null
                : target;
        const over = event.over;
        if (!over) return null;
        const overId = String(over.id);
        if (overId === END_ZONE_ID) return { kind: 'end' };
        if (overId.startsWith('gap:')) {
            return { kind: 'row', rowIndex: Number(overId.split(':')[1]) };
        }
        if (overId.startsWith('slot:')) {
            const [, rowIdx, blockIdx] = overId.split(':');
            return legalise({
                kind: 'cell',
                rowIndex: Number(rowIdx),
                blockIndex: Number(blockIdx),
            });
        }
        const location = locateBlock(config, overId);
        if (!location) return null;
        const activeRect = event.active.rect.current.translated;

        const draggedLocation = draggedBlockId
            ? locateBlock(config, draggedBlockId)
            : undefined;
        const sameMultiBlockRow =
            !!draggedLocation &&
            draggedLocation.rowIndex === location.rowIndex &&
            config.rows[location.rowIndex].blocks.length > 1;

        if (sameMultiBlockRow) {
            const activeCenterX = activeRect
                ? activeRect.left + activeRect.width / 2
                : over.rect.left;
            const relX = (activeCenterX - over.rect.left) / over.rect.width;
            return {
                kind: 'cell',
                rowIndex: location.rowIndex,
                blockIndex: location.blockIndex + (relX < 0.5 ? 0 : 1),
            };
        }

        const activeCenterY = activeRect
            ? activeRect.top + activeRect.height / 2
            : over.rect.top;
        const relY = (activeCenterY - over.rect.top) / over.rect.height;
        return {
            kind: 'row',
            rowIndex: location.rowIndex + (relY < 0.5 ? 0 : 1),
        };
    };

    const handleDragStart = (event: DragStartEvent) => {
        const source = event.active.data.current as DragSource | undefined;
        setActiveDrag(source ?? null);
        setDropIndicator(null);
        setJustPlacedId(null);
    };

    // Only track where the drop will land — never mutate the layout mid-drag.
    const handleDragOver = (event: DragOverEvent) => {
        const source = event.active.data.current as DragSource | undefined;
        if (!source) return;
        setDropIndicator(computeTarget(draft, event, source));
    };

    // Commit the drop once. New blocks get an entrance animation; existing
    // blocks relocate in place.
    const handleDragEnd = (event: DragEndEvent) => {
        const source = event.active.data.current as DragSource | undefined;
        setActiveDrag(null);
        setDropIndicator(null);
        if (!source || !event.over) return;
        const target = computeTarget(draft, event, source);
        if (!target) return;
        if (source.kind === 'new') {
            const block = source.definition.create();
            setDraft((prev) => dropNewBlock(prev, block, target));
            setJustPlacedId(block.id);
            return;
        }
        const location = locateBlock(draft, source.blockId);
        if (
            target.kind === 'cell' &&
            location &&
            target.rowIndex !== location.rowIndex &&
            !canDropInRow(draft, target.rowIndex, source.blockId)
        ) {
            return;
        }
        setDraft((prev) => dropExistingBlock(prev, source.blockId, target));
    };

    const handleDragCancel = () => {
        setActiveDrag(null);
        setDropIndicator(null);
    };

    const rowIndicatorActive = (boundary: number) =>
        dropIndicator?.kind === 'row' && dropIndicator.rowIndex === boundary;
    const endIndicatorActive =
        dropIndicator?.kind === 'end' ||
        (dropIndicator?.kind === 'row' &&
            dropIndicator.rowIndex === draft.rows.length);
    const cellIndicatorActive = (rowIndex: number, blockIndex: number) =>
        dropIndicator?.kind === 'cell' &&
        dropIndicator.rowIndex === rowIndex &&
        dropIndicator.blockIndex === blockIndex;

    return (
        <div className={classes.builderRoot}>
            <div className={classes.toolbar}>
                <button
                    type="button"
                    className={classes.tbBtn}
                    onClick={() => navigate(`/projects/${projectUuid}/home`)}
                >
                    <MantineIcon icon={IconArrowLeft} size={15} />
                    Exit
                </button>
                <div className={classes.toolbarDivider} />
                <Group gap={10} wrap="nowrap">
                    <Menu position="bottom-start" width={280}>
                        <Menu.Target>
                            <button
                                type="button"
                                className={`${classes.tbBtn} ${classes.tbBtnStrong}`}
                            >
                                <MantineIcon
                                    icon={IconUsers}
                                    size={15}
                                    color="ldGray.6"
                                />
                                Editing:{' '}
                                <strong>
                                    {homepage.name}
                                    {homepage.isDefault
                                        ? ' (live)'
                                        : ' (draft)'}
                                </strong>
                                <MantineIcon
                                    icon={IconChevronDown}
                                    size={13}
                                    color="ldGray.6"
                                />
                            </button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Label>Project homepages</Menu.Label>
                            {homepages.map((item) => (
                                <Menu.Item
                                    key={item.homepageUuid}
                                    leftSection={
                                        item.homepageUuid ===
                                        homepage.homepageUuid ? (
                                            <MantineIcon
                                                icon={IconCheck}
                                                color="ldGray.7"
                                            />
                                        ) : undefined
                                    }
                                    onClick={() =>
                                        onSwitchHomepage(item.homepageUuid)
                                    }
                                >
                                    {item.name}
                                    {item.isDefault ? ' · live' : ''}
                                </Menu.Item>
                            ))}
                            <Menu.Divider />
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconPlus} />}
                                onClick={onCreateNew}
                            >
                                New homepage…
                            </Menu.Item>
                            <Menu.Item
                                color="red"
                                leftSection={<MantineIcon icon={IconTrash} />}
                                onClick={() => setIsDeleteModalOpen(true)}
                            >
                                Delete this homepage
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Group>
                <Box flex={1} />
                {isDirty ? (
                    <span className={classes.savedIndicator}>Saving…</span>
                ) : (
                    <span className={classes.savedIndicator}>
                        <MantineIcon
                            icon={IconCircleCheck}
                            size={14}
                            color="green"
                        />
                        Draft saved
                    </span>
                )}
                {canRevertToPublished && (
                    <button
                        type="button"
                        className={classes.tbBtn}
                        onClick={() => setIsDiscardModalOpen(true)}
                    >
                        <MantineIcon icon={IconArrowBackUp} size={15} />
                        Revert to published
                    </button>
                )}
                <button
                    type="button"
                    className={classes.tbBtn}
                    onClick={togglePreview}
                >
                    <MantineIcon
                        icon={isPreviewing ? IconPencil : IconEye}
                        size={15}
                    />
                    {isPreviewing ? 'Back to editing' : 'Preview'}
                </button>
                <button
                    type="button"
                    className={classes.tbBtnPrimary}
                    disabled={publishMutation.isLoading}
                    onClick={handleOpenPublish}
                >
                    Publish
                    <MantineIcon icon={IconArrowRight} size={14} />
                </button>
            </div>
            {hasConflict && (
                <div className={classes.conflictBanner}>
                    <Text size="sm" fw={500}>
                        This homepage was changed somewhere else — your latest
                        edits here can’t be saved.
                    </Text>
                    <Button size="xs" onClick={onReload}>
                        Reload homepage
                    </Button>
                </div>
            )}
            {isPreviewing && (
                <div className={classes.previewBar}>
                    <ViewAsControl
                        projectUuid={projectUuid}
                        viewType={viewType}
                        target={viewTarget}
                        onViewTypeChange={setViewType}
                        onTargetChange={setViewTarget}
                    />
                </div>
            )}

            <DndContext
                sensors={sensors}
                collisionDetection={collisionDetectionStrategy}
                measuring={{
                    droppable: { strategy: MeasuringStrategy.WhileDragging },
                }}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
            >
                <div className={classes.body}>
                    {!isPreviewing && (
                        <aside className={classes.rail}>
                            <div className={classes.railTitle}>Blocks</div>
                            <Stack gap={6}>
                                {availableBlocks.map((definition) => (
                                    <LibraryCard
                                        key={definition.type}
                                        definition={definition}
                                        onAdd={() =>
                                            setDraft((prev) =>
                                                addBlock(
                                                    prev,
                                                    definition.create(),
                                                ),
                                            )
                                        }
                                    />
                                ))}
                            </Stack>
                            <div className={classes.railHint}>
                                Click to add, or drag a block onto the page.
                            </div>
                        </aside>
                    )}
                    <div className={classes.canvas}>
                        <div className={classes.canvasInner}>
                            {isPreviewing ? (
                                <PreviewPane
                                    draft={draft}
                                    projectUuid={projectUuid}
                                    target={viewTarget}
                                />
                            ) : (
                                <Stack gap={0} flex={1} miw={0}>
                                    {draft.rows.map((row, rowIndex) => (
                                        <Box key={row.id}>
                                            <RowGap
                                                rowIndex={rowIndex}
                                                isDragActive={
                                                    activeDrag !== null
                                                }
                                                active={rowIndicatorActive(
                                                    rowIndex,
                                                )}
                                                blocks={availableBlocks}
                                                onQuickAdd={(definition) =>
                                                    setDraft((prev) =>
                                                        dropNewBlock(
                                                            prev,
                                                            definition.create(),
                                                            {
                                                                kind: 'row',
                                                                rowIndex,
                                                            },
                                                        ),
                                                    )
                                                }
                                            />
                                            {activeDrag &&
                                                rowIndicatorActive(
                                                    rowIndex,
                                                ) && (
                                                    <GhostBlock
                                                        definition={
                                                            activeDrag.definition
                                                        }
                                                    />
                                                )}
                                            <SortableContext
                                                items={row.blocks.map(
                                                    (block) => block.id,
                                                )}
                                                strategy={
                                                    horizontalListSortingStrategy
                                                }
                                            >
                                                <Group
                                                    gap="md"
                                                    align="stretch"
                                                    wrap="nowrap"
                                                    className={`${
                                                        classes.rowColumns
                                                    } ${layout.row} ${
                                                        TIER_CLASS[
                                                            resolvedRows[
                                                                rowIndex
                                                            ].widthTier
                                                        ]
                                                    }`}
                                                    data-fit={
                                                        resolvedRows[rowIndex]
                                                            .fit
                                                    }
                                                    data-align={
                                                        resolvedRows[rowIndex]
                                                            .align
                                                    }
                                                >
                                                    {row.blocks.map(
                                                        (block, blockIndex) => {
                                                            const definition =
                                                                getBlockDefinition(
                                                                    block.type,
                                                                );
                                                            if (!definition)
                                                                return null;
                                                            return (
                                                                <Fragment
                                                                    key={
                                                                        block.id
                                                                    }
                                                                >
                                                                    {activeDrag && (
                                                                        <ColIndicator
                                                                            active={cellIndicatorActive(
                                                                                rowIndex,
                                                                                blockIndex,
                                                                            )}
                                                                        />
                                                                    )}
                                                                    <div
                                                                        className={
                                                                            layout.col
                                                                        }
                                                                        data-weight={
                                                                            resolvedRows[
                                                                                rowIndex
                                                                            ]
                                                                                .columns[
                                                                                blockIndex
                                                                            ]
                                                                                .weight
                                                                        }
                                                                        data-hug-units={
                                                                            resolvedRows[
                                                                                rowIndex
                                                                            ]
                                                                                .columns[
                                                                                blockIndex
                                                                            ]
                                                                                .hugUnits ??
                                                                            undefined
                                                                        }
                                                                    >
                                                                        <BlockCard
                                                                            itemSpan={
                                                                                resolvedRows[
                                                                                    rowIndex
                                                                                ]
                                                                                    .columns[
                                                                                    blockIndex
                                                                                ]
                                                                                    .itemSpan
                                                                            }
                                                                            block={
                                                                                block
                                                                            }
                                                                            definition={
                                                                                definition
                                                                            }
                                                                            justPlaced={
                                                                                block.id ===
                                                                                justPlacedId
                                                                            }
                                                                            projectUuid={
                                                                                projectUuid
                                                                            }
                                                                            canUp={canMoveUp(
                                                                                draft,
                                                                                block.id,
                                                                            )}
                                                                            canDown={canMoveDown(
                                                                                draft,
                                                                                block.id,
                                                                            )}
                                                                            onUp={() =>
                                                                                setDraft(
                                                                                    (
                                                                                        prev,
                                                                                    ) =>
                                                                                        moveBlockUp(
                                                                                            prev,
                                                                                            block.id,
                                                                                        ),
                                                                                )
                                                                            }
                                                                            onDown={() =>
                                                                                setDraft(
                                                                                    (
                                                                                        prev,
                                                                                    ) =>
                                                                                        moveBlockDown(
                                                                                            prev,
                                                                                            block.id,
                                                                                        ),
                                                                                )
                                                                            }
                                                                            onDuplicate={() =>
                                                                                setDraft(
                                                                                    (
                                                                                        prev,
                                                                                    ) =>
                                                                                        duplicateBlock(
                                                                                            prev,
                                                                                            block.id,
                                                                                        ),
                                                                                )
                                                                            }
                                                                            onRemove={() =>
                                                                                setDraft(
                                                                                    (
                                                                                        prev,
                                                                                    ) =>
                                                                                        removeBlock(
                                                                                            prev,
                                                                                            block.id,
                                                                                        ),
                                                                                )
                                                                            }
                                                                            onChange={(
                                                                                updated,
                                                                            ) =>
                                                                                setDraft(
                                                                                    (
                                                                                        prev,
                                                                                    ) =>
                                                                                        replaceBlock(
                                                                                            prev,
                                                                                            updated,
                                                                                        ),
                                                                                )
                                                                            }
                                                                        />
                                                                    </div>
                                                                </Fragment>
                                                            );
                                                        },
                                                    )}
                                                    {canAddColumn(
                                                        draft,
                                                        rowIndex,
                                                    ) ? (
                                                        <ColumnGutter
                                                            rowIndex={rowIndex}
                                                            insertIndex={
                                                                row.blocks
                                                                    .length
                                                            }
                                                            isDragActive={
                                                                activeDrag !==
                                                                null
                                                            }
                                                            active={cellIndicatorActive(
                                                                rowIndex,
                                                                row.blocks
                                                                    .length,
                                                            )}
                                                            blocks={
                                                                columnBlocks
                                                            }
                                                            onAdd={(def) =>
                                                                setDraft(
                                                                    (prev) =>
                                                                        dropNewBlock(
                                                                            prev,
                                                                            def.create(),
                                                                            {
                                                                                kind: 'cell',
                                                                                rowIndex,
                                                                                blockIndex:
                                                                                    row
                                                                                        .blocks
                                                                                        .length,
                                                                            },
                                                                        ),
                                                                )
                                                            }
                                                        />
                                                    ) : (
                                                        activeDrag && (
                                                            <ColIndicator
                                                                active={cellIndicatorActive(
                                                                    rowIndex,
                                                                    row.blocks
                                                                        .length,
                                                                )}
                                                            />
                                                        )
                                                    )}
                                                </Group>
                                            </SortableContext>
                                        </Box>
                                    ))}
                                    {activeDrag && endIndicatorActive && (
                                        <GhostBlock
                                            definition={activeDrag.definition}
                                        />
                                    )}
                                    <EndDropZone
                                        isEmpty={draft.rows.length === 0}
                                        active={false}
                                    />
                                </Stack>
                            )}
                        </div>
                    </div>
                </div>
                <DragOverlay dropAnimation={null}>
                    {activeDrag ? (
                        <div className={classes.dragOverlayBlock}>
                            <div className={classes.dragOverlayHeader}>
                                <IconSquare icon={activeDrag.definition.icon} />
                                <span className={classes.dragOverlayLabel}>
                                    {activeDrag.definition.label}
                                </span>
                            </div>
                            <div className={classes.dragOverlayDesc}>
                                {activeDrag.definition.description}
                            </div>
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
            <PublishModal
                opened={isPublishModalOpen}
                onClose={() => setIsPublishModalOpen(false)}
                projectUuid={projectUuid}
                homepageUuid={homepage.homepageUuid}
                homepageName={homepage.name}
                isPublishing={publishMutation.isLoading}
                onPublish={(audience) =>
                    publishMutation.mutate(
                        { audience },
                        {
                            onSuccess: () => setIsPublishModalOpen(false),
                        },
                    )
                }
            />
            <MantineModal
                opened={isDiscardModalOpen}
                onClose={() =>
                    !discardDraftMutation.isLoading &&
                    setIsDiscardModalOpen(false)
                }
                title="Revert to published"
                role="alertdialog"
                description="This discards your unpublished changes and restores the last published version of this homepage. This can't be undone."
                confirmLabel="Revert draft"
                cancelDisabled={discardDraftMutation.isLoading}
                onConfirm={handleDiscardDraft}
                confirmLoading={discardDraftMutation.isLoading}
            />
            <MantineModal
                opened={isDeleteModalOpen}
                onClose={() =>
                    !deleteMutation.isLoading && setIsDeleteModalOpen(false)
                }
                title="Delete homepage"
                variant="delete"
                resourceType="homepage"
                resourceLabel={homepage.name}
                cancelDisabled={deleteMutation.isLoading}
                onConfirm={() =>
                    deleteMutation.mutate(homepage.homepageUuid, {
                        onSuccess: onDeleted,
                    })
                }
                confirmLoading={deleteMutation.isLoading}
            />
        </div>
    );
};
