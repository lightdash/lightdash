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
    IconCircleCheck,
    IconCopy,
    IconEye,
    IconPencil,
    IconSend,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    blockLibrary,
    createBlock,
    getBlockDefinition,
} from './blocks/registry';
import {
    addBlock,
    canMoveDown,
    canMoveUp,
    duplicateBlock,
    moveBlockDown,
    moveBlockUp,
    removeBlock,
    updateBlockConfig,
} from './configOps';
import {
    usePublishHomepage,
    useUpdateHomepageDraft,
} from './hooks/useProjectHomepage';
import { PublishedHomepage } from './PublishedHomepage';

type Props = {
    homepage: ProjectHomepageType;
    projectUuid: string;
};

export const HomepageEditor: FC<Props> = ({ homepage, projectUuid }) => {
    const navigate = useNavigate();
    const updateMutation = useUpdateHomepageDraft(
        projectUuid,
        homepage.homepageUuid,
    );
    const publishMutation = usePublishHomepage(
        projectUuid,
        homepage.homepageUuid,
    );

    const [draft, setDraft] = useState<HomepageConfig>(homepage.draftConfig);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [debouncedDraft] = useDebouncedValue(draft, 800);
    const lastSavedRef = useRef<HomepageConfig>(homepage.draftConfig);

    const { mutate: saveDraft } = updateMutation;
    useEffect(() => {
        if (debouncedDraft === lastSavedRef.current) return;
        lastSavedRef.current = debouncedDraft;
        saveDraft({ draftConfig: debouncedDraft });
    }, [debouncedDraft, saveDraft]);

    const handlePublish = async () => {
        if (draft !== lastSavedRef.current) {
            lastSavedRef.current = draft;
            await updateMutation.mutateAsync({ draftConfig: draft });
        }
        publishMutation.mutate();
    };

    const isDirty = draft !== lastSavedRef.current || updateMutation.isLoading;

    return (
        <Stack gap="lg" w="100%">
            <Group justify="space-between">
                <Button
                    variant="default"
                    leftSection={<MantineIcon icon={IconArrowLeft} />}
                    onClick={() => navigate(`/projects/${projectUuid}/home`)}
                >
                    Exit
                </Button>
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
                        onClick={handlePublish}
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
                            {blockLibrary.map((definition) => (
                                <Paper
                                    key={definition.type}
                                    withBorder
                                    p="sm"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() =>
                                        setDraft((prev) =>
                                            addBlock(
                                                prev,
                                                createBlock(definition),
                                            ),
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
                                Click a block to add it to the page.
                            </Text>
                        </Stack>
                    </Card>

                    <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
                        {draft.rows.map((row) => (
                            <Group
                                key={row.id}
                                gap="md"
                                align="stretch"
                                wrap="nowrap"
                            >
                                {row.blocks.map((block) => {
                                    const definition = getBlockDefinition(
                                        block.type,
                                    );
                                    if (!definition) return null;
                                    const { Build } = definition;
                                    return (
                                        <Card
                                            key={block.id}
                                            withBorder
                                            p="sm"
                                            style={{ flex: 1, minWidth: 0 }}
                                        >
                                            <Group
                                                gap={4}
                                                mb="xs"
                                                justify="space-between"
                                            >
                                                <Text
                                                    size="xs"
                                                    fw={600}
                                                    tt="uppercase"
                                                    c="dimmed"
                                                >
                                                    {definition.label}
                                                </Text>
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
                                                                    (prev) =>
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
                                                                    (prev) =>
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
                                                                    (prev) =>
                                                                        duplicateBlock(
                                                                            prev,
                                                                            block.id,
                                                                        ),
                                                                )
                                                            }
                                                        >
                                                            <MantineIcon
                                                                icon={IconCopy}
                                                            />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                    <Tooltip label="Remove">
                                                        <ActionIcon
                                                            variant="subtle"
                                                            color="red"
                                                            onClick={() =>
                                                                setDraft(
                                                                    (prev) =>
                                                                        removeBlock(
                                                                            prev,
                                                                            block.id,
                                                                        ),
                                                                )
                                                            }
                                                        >
                                                            <MantineIcon
                                                                icon={IconTrash}
                                                            />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                </Group>
                                            </Group>
                                            <Build
                                                block={block}
                                                onChange={(config) =>
                                                    setDraft((prev) =>
                                                        updateBlockConfig(
                                                            prev,
                                                            block.id,
                                                            config,
                                                        ),
                                                    )
                                                }
                                            />
                                        </Card>
                                    );
                                })}
                            </Group>
                        ))}
                        {draft.rows.length === 0 && (
                            <Text size="sm" c="dimmed">
                                No blocks yet — add one from the library.
                            </Text>
                        )}
                    </Stack>
                </Group>
            )}
        </Stack>
    );
};
