import {
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
    IconLayoutGrid,
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
import { PresetsModal } from './PresetsModal';
import { PublishedHomepage } from './PublishedHomepage';
import { PublishModal } from './PublishModal';
import { ViewAsModal } from './ViewAsModal';

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
    const [isPresetsModalOpen, setIsPresetsModalOpen] = useState(false);
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [isViewAsModalOpen, setIsViewAsModalOpen] = useState(false);

    const isAiEnabled = useAiAgentButtonVisibility();
    const availableBlocks = blockLibrary.filter(
        (definition) => !definition.requiresAi || isAiEnabled,
    );

    const [draft, setDraft] = useState<HomepageConfig>(homepage.draftConfig);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [debouncedDraft] = useDebouncedValue(draft, 800);
    const [hasConflict, setHasConflict] = useState(false);
    const lastSavedRef = useRef<HomepageConfig>(homepage.draftConfig);
    // Compare-and-set token so a stale editor can never clobber newer state
    const baseUpdatedAtRef = useRef<Date>(homepage.updatedAt);

    const { mutate: saveDraft } = updateMutation;
    useEffect(() => {
        if (hasConflict || debouncedDraft === lastSavedRef.current) return;
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
    }, [debouncedDraft, hasConflict, saveDraft]);

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

    type DragSource =
        | { kind: 'new'; definition: BlockDefinition }
        | { kind: 'existing'; blockId: string };
    const [drag, setDrag] = useState<DragSource | null>(null);
    const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

    const clearDrag = () => {
        setDrag(null);
        setDropTarget(null);
    };

    const handleDrop = (target: DropTarget) => {
        if (!drag) return;
        setDraft((prev) =>
            drag.kind === 'new'
                ? dropNewBlock(prev, drag.definition.create(), target)
                : dropExistingBlock(prev, drag.blockId, target),
        );
        clearDrag();
    };

    const dropZoneProps = (target: DropTarget) => ({
        onDragOver: (e: React.DragEvent) => {
            if (!drag) return;
            e.preventDefault();
            setDropTarget(target);
        },
        onDrop: (e: React.DragEvent) => {
            if (!drag) return;
            e.preventDefault();
            handleDrop(target);
        },
    });

    const isDropTarget = (target: DropTarget): boolean => {
        if (!dropTarget) return false;
        if (dropTarget.kind !== target.kind) return false;
        if (dropTarget.kind === 'end') return true;
        if (dropTarget.kind === 'row' && target.kind === 'row') {
            return dropTarget.rowIndex === target.rowIndex;
        }
        return (
            dropTarget.kind === 'cell' &&
            target.kind === 'cell' &&
            dropTarget.rowIndex === target.rowIndex &&
            dropTarget.blockIndex === target.blockIndex
        );
    };

    const draggedBlockId = drag?.kind === 'existing' ? drag.blockId : undefined;

    return (
        <div className={classes.builderRoot}>
            <div className={classes.toolbar}>
                <Button
                    variant="default"
                    size="sm"
                    leftSection={<MantineIcon icon={IconArrowLeft} />}
                    onClick={() => navigate(`/projects/${projectUuid}/home`)}
                >
                    Exit
                </Button>
                <div className={classes.toolbarDivider} />
                <Group gap={10} wrap="nowrap">
                    <Menu position="bottom-start" width={280}>
                        <Menu.Target>
                            <Button
                                variant="default"
                                leftSection={<MantineIcon icon={IconUsers} />}
                                rightSection={
                                    <MantineIcon icon={IconChevronDown} />
                                }
                            >
                                Editing: {homepage.name}
                                {homepage.isDefault ? ' (live)' : ' (draft)'}
                            </Button>
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
                                                color="blue"
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
                    <Button
                        variant="default"
                        size="sm"
                        leftSection={<MantineIcon icon={IconLayoutGrid} />}
                        onClick={() => setIsPresetsModalOpen(true)}
                    >
                        Presets
                    </Button>
                </Group>
                <Box style={{ flex: 1 }} />
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
                <Button
                    variant="default"
                    size="sm"
                    leftSection={
                        <MantineIcon
                            icon={isPreviewing ? IconPencil : IconEye}
                        />
                    }
                    onClick={() => setIsPreviewing((prev) => !prev)}
                >
                    {isPreviewing ? 'Back to editing' : 'Preview'}
                </Button>
                <Button
                    variant="default"
                    size="sm"
                    leftSection={<MantineIcon icon={IconUserSearch} />}
                    onClick={() => setIsViewAsModalOpen(true)}
                >
                    View as
                </Button>
                <Button
                    size="sm"
                    rightSection={<MantineIcon icon={IconArrowRight} />}
                    loading={publishMutation.isLoading}
                    onClick={handleOpenPublish}
                >
                    Publish
                </Button>
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

            <div className={classes.body}>
                {!isPreviewing && (
                    <aside className={classes.rail}>
                        <div className={classes.railTitle}>Blocks</div>
                        <Stack gap={6}>
                            {availableBlocks.map((definition) => (
                                <div
                                    key={definition.type}
                                    className={classes.railCard}
                                    draggable
                                    onDragStart={() =>
                                        setDrag({ kind: 'new', definition })
                                    }
                                    onDragEnd={clearDrag}
                                    onClick={() =>
                                        setDraft((prev) =>
                                            addBlock(prev, definition.create()),
                                        )
                                    }
                                >
                                    <IconSquare
                                        icon={definition.icon}
                                        tint={definition.tint}
                                    />
                                    <Box style={{ minWidth: 0 }}>
                                        <div className={classes.railCardLabel}>
                                            {definition.label}
                                        </div>
                                        <div className={classes.railCardDesc}>
                                            {definition.description}
                                        </div>
                                    </Box>
                                </div>
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
                            <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                                {draft.rows.map((row, rowIndex) => (
                                    <Box key={row.id}>
                                        <Box
                                            h={drag ? 18 : 12}
                                            {...dropZoneProps({
                                                kind: 'row',
                                                rowIndex,
                                            })}
                                        >
                                            <Box
                                                h={3}
                                                style={{
                                                    borderRadius: 2,
                                                    marginTop: drag ? 7 : 4,
                                                    background: isDropTarget({
                                                        kind: 'row',
                                                        rowIndex,
                                                    })
                                                        ? 'var(--mantine-color-blue-5)'
                                                        : 'transparent',
                                                }}
                                            />
                                        </Box>
                                        <Group
                                            gap="md"
                                            align="stretch"
                                            wrap="nowrap"
                                        >
                                            {row.blocks.map(
                                                (block, blockIndex) => {
                                                    const definition =
                                                        getBlockDefinition(
                                                            block.type,
                                                        );
                                                    if (!definition)
                                                        return null;
                                                    const { Build } =
                                                        definition;
                                                    const showSideZones =
                                                        drag !== null &&
                                                        canDropInRow(
                                                            draft,
                                                            rowIndex,
                                                            draggedBlockId,
                                                        );
                                                    return (
                                                        <div
                                                            key={block.id}
                                                            className={
                                                                classes.blockChrome
                                                            }
                                                        >
                                                            {showSideZones && (
                                                                <>
                                                                    <Box
                                                                        style={{
                                                                            position:
                                                                                'absolute',
                                                                            left: -14,
                                                                            top: 0,
                                                                            bottom: 0,
                                                                            width: 24,
                                                                            zIndex: 20,
                                                                            display:
                                                                                'flex',
                                                                            justifyContent:
                                                                                'center',
                                                                        }}
                                                                        {...dropZoneProps(
                                                                            {
                                                                                kind: 'cell',
                                                                                rowIndex,
                                                                                blockIndex,
                                                                            },
                                                                        )}
                                                                    >
                                                                        <Box
                                                                            w={
                                                                                3
                                                                            }
                                                                            style={{
                                                                                borderRadius: 2,
                                                                                background:
                                                                                    isDropTarget(
                                                                                        {
                                                                                            kind: 'cell',
                                                                                            rowIndex,
                                                                                            blockIndex,
                                                                                        },
                                                                                    )
                                                                                        ? 'var(--mantine-color-blue-5)'
                                                                                        : 'transparent',
                                                                            }}
                                                                        />
                                                                    </Box>
                                                                    <Box
                                                                        style={{
                                                                            position:
                                                                                'absolute',
                                                                            right: -14,
                                                                            top: 0,
                                                                            bottom: 0,
                                                                            width: 24,
                                                                            zIndex: 20,
                                                                            display:
                                                                                'flex',
                                                                            justifyContent:
                                                                                'center',
                                                                        }}
                                                                        {...dropZoneProps(
                                                                            {
                                                                                kind: 'cell',
                                                                                rowIndex,
                                                                                blockIndex:
                                                                                    blockIndex +
                                                                                    1,
                                                                            },
                                                                        )}
                                                                    >
                                                                        <Box
                                                                            w={
                                                                                3
                                                                            }
                                                                            style={{
                                                                                borderRadius: 2,
                                                                                background:
                                                                                    isDropTarget(
                                                                                        {
                                                                                            kind: 'cell',
                                                                                            rowIndex,
                                                                                            blockIndex:
                                                                                                blockIndex +
                                                                                                1,
                                                                                        },
                                                                                    )
                                                                                        ? 'var(--mantine-color-blue-5)'
                                                                                        : 'transparent',
                                                                            }}
                                                                        />
                                                                    </Box>
                                                                </>
                                                            )}
                                                            <Group
                                                                gap={4}
                                                                mb="xs"
                                                                justify="space-between"
                                                            >
                                                                <Group
                                                                    gap={6}
                                                                    style={{
                                                                        cursor: 'grab',
                                                                    }}
                                                                    draggable
                                                                    onDragStart={(
                                                                        e,
                                                                    ) => {
                                                                        e.stopPropagation();
                                                                        setDrag(
                                                                            {
                                                                                kind: 'existing',
                                                                                blockId:
                                                                                    block.id,
                                                                            },
                                                                        );
                                                                    }}
                                                                    onDragEnd={
                                                                        clearDrag
                                                                    }
                                                                >
                                                                    <MantineIcon
                                                                        icon={
                                                                            IconGripVertical
                                                                        }
                                                                        color="gray"
                                                                    />
                                                                    <span
                                                                        className={
                                                                            classes.blockTypeLabel
                                                                        }
                                                                    >
                                                                        {
                                                                            definition.label
                                                                        }
                                                                    </span>
                                                                </Group>
                                                                <Group gap={2}>
                                                                    <Tooltip label="Move up">
                                                                        <ActionIcon
                                                                            variant="subtle"
                                                                            color="gray"
                                                                            disabled={
                                                                                !canMoveUp(
                                                                                    draft,
                                                                                    block.id,
                                                                                )
                                                                            }
                                                                            onClick={() =>
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
                                                                        >
                                                                            <MantineIcon
                                                                                icon={
                                                                                    IconArrowUp
                                                                                }
                                                                            />
                                                                        </ActionIcon>
                                                                    </Tooltip>
                                                                    <Tooltip label="Move down">
                                                                        <ActionIcon
                                                                            variant="subtle"
                                                                            color="gray"
                                                                            disabled={
                                                                                !canMoveDown(
                                                                                    draft,
                                                                                    block.id,
                                                                                )
                                                                            }
                                                                            onClick={() =>
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
                                                                        >
                                                                            <MantineIcon
                                                                                icon={
                                                                                    IconArrowDown
                                                                                }
                                                                            />
                                                                        </ActionIcon>
                                                                    </Tooltip>
                                                                    <Tooltip label="Duplicate">
                                                                        <ActionIcon
                                                                            variant="subtle"
                                                                            color="gray"
                                                                            onClick={() =>
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
                                                                        >
                                                                            <MantineIcon
                                                                                icon={
                                                                                    IconCopy
                                                                                }
                                                                            />
                                                                        </ActionIcon>
                                                                    </Tooltip>
                                                                    <Tooltip label="Remove">
                                                                        <ActionIcon
                                                                            variant="subtle"
                                                                            color="red"
                                                                            onClick={() =>
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
                                                                        >
                                                                            <MantineIcon
                                                                                icon={
                                                                                    IconTrash
                                                                                }
                                                                            />
                                                                        </ActionIcon>
                                                                    </Tooltip>
                                                                </Group>
                                                            </Group>
                                                            <Build
                                                                block={block}
                                                                projectUuid={
                                                                    projectUuid
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
                                                    );
                                                },
                                            )}
                                        </Group>
                                    </Box>
                                ))}
                                <div
                                    className={
                                        isDropTarget({ kind: 'end' })
                                            ? `${classes.endZone} ${classes.endZoneActive}`
                                            : classes.endZone
                                    }
                                    {...dropZoneProps({ kind: 'end' })}
                                >
                                    <MantineIcon
                                        icon={IconPlus}
                                        size={15}
                                        style={{
                                            marginRight: 6,
                                            verticalAlign: -2,
                                        }}
                                    />
                                    {draft.rows.length === 0
                                        ? 'No blocks yet — click or drag one from the library.'
                                        : 'Drag a block here, or click one in the library.'}
                                </div>
                            </Stack>
                        )}
                    </div>
                </div>
            </div>
            <PresetsModal
                opened={isPresetsModalOpen}
                onClose={() => setIsPresetsModalOpen(false)}
                onApply={setDraft}
            />
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
