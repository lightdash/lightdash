import {
    type HomepageConfig,
    type ProjectHomepage as ProjectHomepageType,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Card,
    Group,
    Menu,
    Paper,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconArrowDown,
    IconArrowLeft,
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
    IconSend,
    IconTrash,
    IconUsers,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useAiAgentButtonVisibility } from '../aiCopilot/hooks/useAiAgentsButtonVisibility';
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
import {
    useDeleteHomepage,
    usePublishHomepage,
    useUpdateHomepageDraft,
} from './hooks/useProjectHomepage';
import { PresetsModal } from './PresetsModal';
import { PublishedHomepage } from './PublishedHomepage';
import { PublishModal } from './PublishModal';

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
        <Stack gap="lg" w="100%">
            {hasConflict && (
                <Group
                    justify="space-between"
                    p="sm"
                    style={{
                        border: '1px solid var(--mantine-color-orange-4)',
                        borderRadius: 8,
                        background: 'var(--mantine-color-orange-0)',
                    }}
                >
                    <Text size="sm" fw={500}>
                        This homepage was changed somewhere else — your latest
                        edits here can’t be saved.
                    </Text>
                    <Button size="xs" onClick={onConflictReload}>
                        Reload homepage
                    </Button>
                </Group>
            )}
            <Group justify="space-between">
                <Group gap="sm">
                    <Button
                        variant="default"
                        leftSection={<MantineIcon icon={IconArrowLeft} />}
                        onClick={() =>
                            navigate(`/projects/${projectUuid}/home`)
                        }
                    >
                        Exit
                    </Button>
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
                        leftSection={<MantineIcon icon={IconLayoutGrid} />}
                        onClick={() => setIsPresetsModalOpen(true)}
                    >
                        Presets
                    </Button>
                </Group>
                <Group gap="sm">
                    {isDirty ? (
                        <Text size="xs" c="dimmed">
                            Saving…
                        </Text>
                    ) : (
                        <Group gap={4}>
                            <MantineIcon icon={IconCircleCheck} color="green" />
                            <Text size="xs" c="dimmed">
                                Draft saved
                            </Text>
                        </Group>
                    )}
                    <Button
                        variant="default"
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
                        leftSection={<MantineIcon icon={IconSend} />}
                        loading={publishMutation.isLoading}
                        onClick={handleOpenPublish}
                    >
                        Publish
                    </Button>
                </Group>
            </Group>

            {isPreviewing ? (
                <PublishedHomepage config={draft} projectUuid={projectUuid} />
            ) : (
                <Group align="flex-start" gap="lg" wrap="nowrap">
                    <Card withBorder w={264} p="sm" style={{ flexShrink: 0 }}>
                        <Stack gap="xs">
                            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                                Blocks
                            </Text>
                            {availableBlocks.map((definition) => (
                                <Paper
                                    key={definition.type}
                                    withBorder
                                    p="sm"
                                    style={{ cursor: 'grab' }}
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
                                    <Group gap="sm" wrap="nowrap">
                                        <MantineIcon
                                            icon={definition.icon}
                                            size="lg"
                                        />
                                        <Box>
                                            <Text size="sm" fw={500}>
                                                {definition.label}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {definition.description}
                                            </Text>
                                        </Box>
                                    </Group>
                                </Paper>
                            ))}
                            <Text size="xs" c="dimmed">
                                Click to add, or drag a block onto the page.
                            </Text>
                        </Stack>
                    </Card>

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
                                <Group gap="md" align="stretch" wrap="nowrap">
                                    {row.blocks.map((block, blockIndex) => {
                                        const definition = getBlockDefinition(
                                            block.type,
                                        );
                                        if (!definition) return null;
                                        const { Build } = definition;
                                        const showSideZones =
                                            drag !== null &&
                                            canDropInRow(
                                                draft,
                                                rowIndex,
                                                draggedBlockId,
                                            );
                                        return (
                                            <Card
                                                key={block.id}
                                                withBorder
                                                p="sm"
                                                style={{
                                                    flex: 1,
                                                    minWidth: 0,
                                                    position: 'relative',
                                                }}
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
                                                                display: 'flex',
                                                                justifyContent:
                                                                    'center',
                                                            }}
                                                            {...dropZoneProps({
                                                                kind: 'cell',
                                                                rowIndex,
                                                                blockIndex,
                                                            })}
                                                        >
                                                            <Box
                                                                w={3}
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
                                                                display: 'flex',
                                                                justifyContent:
                                                                    'center',
                                                            }}
                                                            {...dropZoneProps({
                                                                kind: 'cell',
                                                                rowIndex,
                                                                blockIndex:
                                                                    blockIndex +
                                                                    1,
                                                            })}
                                                        >
                                                            <Box
                                                                w={3}
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
                                                        onDragStart={(e) => {
                                                            e.stopPropagation();
                                                            setDrag({
                                                                kind: 'existing',
                                                                blockId:
                                                                    block.id,
                                                            });
                                                        }}
                                                        onDragEnd={clearDrag}
                                                    >
                                                        <MantineIcon
                                                            icon={
                                                                IconGripVertical
                                                            }
                                                            color="gray"
                                                        />
                                                        <Text
                                                            size="xs"
                                                            fw={600}
                                                            tt="uppercase"
                                                            c="dimmed"
                                                        >
                                                            {definition.label}
                                                        </Text>
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
                                                    projectUuid={projectUuid}
                                                    onChange={(updated) =>
                                                        setDraft((prev) =>
                                                            replaceBlock(
                                                                prev,
                                                                updated,
                                                            ),
                                                        )
                                                    }
                                                />
                                            </Card>
                                        );
                                    })}
                                </Group>
                            </Box>
                        ))}
                        <Box
                            mt="md"
                            p="lg"
                            style={{
                                border: `2px dashed ${
                                    isDropTarget({ kind: 'end' })
                                        ? 'var(--mantine-color-blue-5)'
                                        : 'var(--mantine-color-gray-4)'
                                }`,
                                borderRadius: 12,
                                textAlign: 'center',
                            }}
                            {...dropZoneProps({ kind: 'end' })}
                        >
                            <Text size="sm" c="dimmed" fw={500}>
                                {draft.rows.length === 0
                                    ? 'No blocks yet — click or drag one from the library.'
                                    : 'Drag a block here, or click one in the library.'}
                            </Text>
                        </Box>
                    </Stack>
                </Group>
            )}
            <PresetsModal
                opened={isPresetsModalOpen}
                onClose={() => setIsPresetsModalOpen(false)}
                onApply={setDraft}
            />
            <PublishModal
                opened={isPublishModalOpen}
                onClose={() => setIsPublishModalOpen(false)}
                projectUuid={projectUuid}
                homepageUuid={homepage.homepageUuid}
                homepageName={homepage.name}
                isPublishing={publishMutation.isLoading}
                onPublish={(audience) =>
                    publishMutation.mutate(audience, {
                        onSuccess: () => setIsPublishModalOpen(false),
                    })
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
        </Stack>
    );
};
