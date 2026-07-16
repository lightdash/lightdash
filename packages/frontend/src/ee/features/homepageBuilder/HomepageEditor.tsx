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
    type HomepageBlock,
    type HomepageConfig,
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
    IconUserSearch,
    IconUsers,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useAiAgentButtonVisibility } from '../aiCopilot/hooks/useAiAgentsButtonVisibility';
import { IconSquare } from './blocks/BlockShell';
import {
    blockLibrary,
    getBlockDefinition,
    type BlockDefinition,
} from './blocks/registry';
import {
    addBlock,
    canDropInRow,
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
import {
    useDeleteHomepage,
    usePublishHomepage,
    useUpdateHomepageDraft,
} from './hooks/useProjectHomepage';
import { PublishedHomepage } from './PublishedHomepage';
import { PublishModal } from './PublishModal';
import { ViewAsModal } from './ViewAsModal';

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
    blocks: BlockDefinition[];
    onQuickAdd: (definition: BlockDefinition) => void;
}> = ({ rowIndex, isDragActive, blocks, onQuickAdd }) => {
    const { setNodeRef, isOver } = useDroppable({ id: gapZoneId(rowIndex) });
    const [menuOpened, setMenuOpened] = useState(false);
    return (
        <div
            ref={setNodeRef}
            className={classes.rowDropZone}
            data-drag-active={isDragActive}
            data-menu-open={menuOpened}
        >
            <div
                className={classes.dropLine}
                data-over={isDragActive && isOver}
            />
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

const EndDropZone: FC<{ isEmpty: boolean }> = ({ isEmpty }) => {
    const { setNodeRef, isOver } = useDroppable({ id: END_ZONE_ID });
    return (
        <div
            ref={setNodeRef}
            className={
                isOver
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
                    <Tooltip label="Duplicate">
                        <ActionIcon
                            variant="subtle"
                            color="ldGray.6"
                            onClick={onDuplicate}
                        >
                            <MantineIcon icon={IconCopy} />
                        </ActionIcon>
                    </Tooltip>
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
    onConflictReload: () => void;
};

export const HomepageEditor: FC<Props> = ({
    homepage,
    projectUuid,
    homepages,
    onSwitchHomepage,
    onCreateNew,
    onDeleted,
    onConflictReload,
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
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [isViewAsModalOpen, setIsViewAsModalOpen] = useState(false);

    const isAiEnabled = useAiAgentButtonVisibility();

    const [draft, setDraft] = useState<HomepageConfig>(homepage.draftConfig);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [debouncedDraft] = useDebouncedValue(draft, 800);
    const [hasConflict, setHasConflict] = useState(false);
    const lastSavedRef = useRef<HomepageConfig>(homepage.draftConfig);
    // Compare-and-set token so a stale editor can never clobber newer state
    const baseUpdatedAtRef = useRef<Date>(homepage.updatedAt);

    const [activeDrag, setActiveDrag] = useState<DragSource | null>(null);
    // Layout as it was when the drag started, for cancel/no-target reverts
    const preDragDraftRef = useRef<HomepageConfig | null>(null);
    // Instance created for a library drag, once it first enters the canvas
    const pendingNewBlockRef = useRef<HomepageBlock | null>(null);

    // Singleton blocks (e.g. metrics) drop out of the library once placed.
    const usedSingletonTypes = new Set(
        draft.rows.flatMap((row) => row.blocks).map((block) => block.type),
    );
    const availableBlocks = blockLibrary.filter(
        (definition) =>
            (!definition.requiresAi || isAiEnabled) &&
            !(definition.singleton && usedSingletonTypes.has(definition.type)),
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

    const isDirty = draft !== lastSavedRef.current || updateMutation.isLoading;

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    );

    // A block being hovered is split into zones: the top/bottom bands reorder
    // the dragged block into its own row above/below (the common case), the
    // narrow left/right edges split it into the same row side-by-side, and
    // the center defaults to reordering above — so merely passing over a
    // block on the way elsewhere doesn't accidentally split it.
    const ROW_ZONE_FRACTION = 0.3;
    const CELL_EDGE_FRACTION = 0.15;

    // Where would the dragged block land, given what the pointer is over?
    const computeTarget = (
        config: HomepageConfig,
        event: DragOverEvent | DragEndEvent,
    ): DropTarget | null => {
        const over = event.over;
        if (!over) return null;
        const overId = String(over.id);
        if (overId === END_ZONE_ID) return { kind: 'end' };
        if (overId.startsWith('gap:')) {
            return { kind: 'row', rowIndex: Number(overId.split(':')[1]) };
        }
        const location = locateBlock(config, overId);
        if (!location) return null;
        const activeRect = event.active.rect.current.translated;
        const activeCenterX = activeRect
            ? activeRect.left + activeRect.width / 2
            : over.rect.left;
        const activeCenterY = activeRect
            ? activeRect.top + activeRect.height / 2
            : over.rect.top;
        const relY = (activeCenterY - over.rect.top) / over.rect.height;

        if (relY < ROW_ZONE_FRACTION) {
            return { kind: 'row', rowIndex: location.rowIndex };
        }
        if (relY > 1 - ROW_ZONE_FRACTION) {
            return { kind: 'row', rowIndex: location.rowIndex + 1 };
        }

        const relX = (activeCenterX - over.rect.left) / over.rect.width;
        if (relX < CELL_EDGE_FRACTION) {
            return {
                kind: 'cell',
                rowIndex: location.rowIndex,
                blockIndex: location.blockIndex,
            };
        }
        if (relX > 1 - CELL_EDGE_FRACTION) {
            return {
                kind: 'cell',
                rowIndex: location.rowIndex,
                blockIndex: location.blockIndex + 1,
            };
        }
        return { kind: 'row', rowIndex: location.rowIndex };
    };

    // Live-preview move: relocate the block in the draft as the drag hovers,
    // so the layout itself shows where the drop will land (Kanban-style).
    const applyPreviewMove = (
        config: HomepageConfig,
        blockId: string,
        target: DropTarget,
    ): HomepageConfig => {
        const location = locateBlock(config, blockId);
        if (!location) return config;
        const row = config.rows[location.rowIndex];
        const isAlone = row.blocks.length === 1;
        // Moving a lone-row block beside its own row is a no-op; skipping it
        // avoids re-creating the row (new id) and remounting block editors.
        if (
            target.kind === 'row' &&
            isAlone &&
            (target.rowIndex === location.rowIndex ||
                target.rowIndex === location.rowIndex + 1)
        ) {
            return config;
        }
        if (
            target.kind === 'end' &&
            isAlone &&
            location.rowIndex === config.rows.length - 1
        ) {
            return config;
        }
        if (
            target.kind === 'cell' &&
            target.rowIndex !== location.rowIndex &&
            !canDropInRow(config, target.rowIndex, blockId)
        ) {
            return config;
        }
        return dropExistingBlock(config, blockId, target);
    };

    const handleDragStart = (event: DragStartEvent) => {
        const source = event.active.data.current as DragSource | undefined;
        setActiveDrag(source ?? null);
        preDragDraftRef.current = draft;
        pendingNewBlockRef.current = null;
    };

    const handleDragOver = (event: DragOverEvent) => {
        const source = event.active.data.current as DragSource | undefined;
        if (!source) return;
        setDraft((prev) => {
            const target = computeTarget(prev, event);
            if (!target) return prev;
            if (source.kind === 'new') {
                if (!pendingNewBlockRef.current) {
                    const block = source.definition.create();
                    const inserted = dropNewBlock(prev, block, target);
                    if (inserted === prev) return prev;
                    pendingNewBlockRef.current = block;
                    return inserted;
                }
                return applyPreviewMove(
                    prev,
                    pendingNewBlockRef.current.id,
                    target,
                );
            }
            return applyPreviewMove(prev, source.blockId, target);
        });
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const source = event.active.data.current as DragSource | undefined;
        const snapshot = preDragDraftRef.current;
        setActiveDrag(null);
        preDragDraftRef.current = null;
        const pendingBlock = pendingNewBlockRef.current;
        pendingNewBlockRef.current = null;
        if (!source) return;
        if (!event.over) {
            // dropped outside any zone: revert the preview
            if (snapshot) setDraft(snapshot);
            return;
        }
        setDraft((prev) => {
            const target = computeTarget(prev, event);
            const blockId =
                source.kind === 'new' ? pendingBlock?.id : source.blockId;
            if (!blockId) {
                // library drag released before any preview insert happened
                if (source.kind === 'new' && target) {
                    return dropNewBlock(
                        prev,
                        source.definition.create(),
                        target,
                    );
                }
                return prev;
            }
            if (!target) return prev;
            return applyPreviewMove(prev, blockId, target);
        });
    };

    const handleDragCancel = () => {
        const snapshot = preDragDraftRef.current;
        setActiveDrag(null);
        preDragDraftRef.current = null;
        pendingNewBlockRef.current = null;
        if (snapshot) setDraft(snapshot);
    };

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
                <button
                    type="button"
                    className={classes.tbBtn}
                    onClick={() => setIsPreviewing((prev) => !prev)}
                >
                    <MantineIcon
                        icon={isPreviewing ? IconPencil : IconEye}
                        size={15}
                    />
                    {isPreviewing ? 'Back to editing' : 'Preview'}
                </button>
                <button
                    type="button"
                    className={classes.tbBtn}
                    onClick={() => setIsViewAsModalOpen(true)}
                >
                    <MantineIcon icon={IconUserSearch} size={15} />
                    View as
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
                    <Button size="xs" onClick={onConflictReload}>
                        Reload homepage
                    </Button>
                </div>
            )}

            <DndContext
                sensors={sensors}
                collisionDetection={collisionDetectionStrategy}
                measuring={{
                    droppable: { strategy: MeasuringStrategy.Always },
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
                                <PublishedHomepage
                                    config={draft}
                                    projectUuid={projectUuid}
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
                                                >
                                                    {row.blocks.map((block) => {
                                                        const definition =
                                                            getBlockDefinition(
                                                                block.type,
                                                            );
                                                        if (!definition)
                                                            return null;
                                                        return (
                                                            <BlockCard
                                                                key={block.id}
                                                                block={block}
                                                                definition={
                                                                    definition
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
                                                        );
                                                    })}
                                                </Group>
                                            </SortableContext>
                                        </Box>
                                    ))}
                                    <EndDropZone
                                        isEmpty={draft.rows.length === 0}
                                    />
                                </Stack>
                            )}
                        </div>
                    </div>
                </div>
                <DragOverlay>
                    {activeDrag ? (
                        <div className={classes.dragOverlayCard}>
                            <div className={classes.railCard}>
                                <IconSquare icon={activeDrag.definition.icon} />
                                <Box miw={0}>
                                    <div className={classes.railCardLabel}>
                                        {activeDrag.definition.label}
                                    </div>
                                    <div className={classes.railCardDesc}>
                                        {activeDrag.definition.description}
                                    </div>
                                </Box>
                            </div>
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
            <ViewAsModal
                opened={isViewAsModalOpen}
                onClose={() => setIsViewAsModalOpen(false)}
                projectUuid={projectUuid}
            />
            <PublishModal
                opened={isPublishModalOpen}
                onClose={() => setIsPublishModalOpen(false)}
                projectUuid={projectUuid}
                homepageUuid={homepage.homepageUuid}
                homepageName={homepage.name}
                isPublishing={publishMutation.isLoading}
                initialAllowPersonal={homepage.allowPersonal}
                onPublish={(audience, allowPersonal) =>
                    publishMutation.mutate(
                        { audience, allowPersonal },
                        {
                            onSuccess: () => setIsPublishModalOpen(false),
                        },
                    )
                }
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
