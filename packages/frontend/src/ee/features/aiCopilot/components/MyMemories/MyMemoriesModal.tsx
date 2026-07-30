import { type AiAgentUserMemoryItem } from '@lightdash/common';
import {
    Box,
    Group,
    Stack,
    Text,
    TextInput,
    UnstyledButton,
} from '@mantine-8/core';
import { IconNotebook, IconSearch } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import EmptyStateLoader from '../../../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../../../components/common/InlineErrorState';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { useProject } from '../../../../../hooks/useProject';
import {
    useMyAiAgentMemories,
    useMyAiAgentMemory,
} from '../../hooks/useAiAgentMemory';
import { MemoryDetails } from '../MemoryDetails/MemoryDetails';
import { MemoryStatusAction } from '../MemoryDetails/MemoryStatusControls';
import styles from './MyMemoriesModal.module.css';

type MyMemoriesModalProps = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
};

const getCitationLabel = (citedCount: number) =>
    citedCount === 0 ? 'never cited' : `${citedCount.toLocaleString()}× cited`;

const MemoryListRow: FC<{
    memory: AiAgentUserMemoryItem;
    isSelected: boolean;
    onSelect: () => void;
}> = ({ memory, isSelected, onSelect }) => (
    <UnstyledButton
        type="button"
        className={styles.row}
        data-selected={isSelected || undefined}
        onClick={onSelect}
    >
        <Box className={styles.rowDot} />
        <Box miw={0}>
            <Text className={styles.rowTitle} lineClamp={2}>
                {memory.title}
            </Text>
            <Text className={styles.rowMeta}>
                {getCitationLabel(memory.citedCount)}
            </Text>
        </Box>
    </UnstyledButton>
);

const MemoryDetailPane: FC<{
    projectUuid: string;
    memory: AiAgentUserMemoryItem;
}> = ({ projectUuid, memory }) => {
    const memoryQuery = useMyAiAgentMemory({ projectUuid, slug: memory.slug });

    return (
        <Stack gap={0} className={styles.detail}>
            <Group
                className={styles.detailHeader}
                justify="space-between"
                align="center"
                wrap="nowrap"
                gap="md"
            >
                <Text className={styles.detailTitle} lineClamp={2}>
                    {memory.title}
                </Text>
                {memoryQuery.data ? (
                    <MemoryStatusAction
                        projectUuid={projectUuid}
                        memoryUuid={memoryQuery.data.uuid}
                        slug={memoryQuery.data.slug}
                        status={memoryQuery.data.status}
                    />
                ) : null}
            </Group>

            <Box className={styles.detailBody}>
                {memoryQuery.data ? (
                    <MemoryDetails
                        memory={memoryQuery.data}
                        projectUuid={projectUuid}
                        agentUuid={memory.agent?.uuid ?? null}
                    />
                ) : memoryQuery.isError ? (
                    <Box p="xl">
                        <InlineErrorState
                            message="Unable to load this memory."
                            onRetry={() => void memoryQuery.refetch()}
                        />
                    </Box>
                ) : (
                    <EmptyStateLoader py="xl" />
                )}
            </Box>
        </Stack>
    );
};

export const MyMemoriesModal: FC<MyMemoriesModalProps> = ({
    opened,
    onClose,
    projectUuid,
}) => {
    const [search, setSearch] = useState('');
    const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
    const { data: project } = useProject(projectUuid);
    const memoriesQuery = useMyAiAgentMemories({
        projectUuid,
        enabled: opened,
    });

    const memories = memoriesQuery.data?.data.memories ?? [];
    const query = search.trim().toLowerCase();
    const matches = query
        ? memories.filter((memory) =>
              memory.title.toLowerCase().includes(query),
          )
        : memories;
    // Selection follows the list: a filtered-out or retired memory falls back
    // to the first match rather than leaving the pane on a stale memory
    const selected =
        matches.find((memory) => memory.slug === selectedSlug) ??
        matches[0] ??
        null;

    let content: ReactNode;
    if (memoriesQuery.isInitialLoading) {
        content = <EmptyStateLoader py="xl" />;
    } else if (memoriesQuery.isError) {
        content = (
            <InlineErrorState
                message="Unable to load your memories."
                onRetry={() => void memoriesQuery.refetch()}
            />
        );
    } else if (memories.length === 0) {
        content = (
            <Stack gap="xs" className={styles.emptyState}>
                <Text size="sm" fw={550}>
                    No memories yet
                </Text>
                <Text size="sm" c="dimmed">
                    The agents haven't saved any memories from your threads in
                    this project yet.
                </Text>
            </Stack>
        );
    } else {
        content = (
            <Box className={styles.layout}>
                <Stack gap={0} className={styles.list}>
                    <Box className={styles.search}>
                        <TextInput
                            size="xs"
                            radius="md"
                            placeholder="Search memories"
                            value={search}
                            onChange={(event) =>
                                setSearch(event.currentTarget.value)
                            }
                            leftSection={
                                <MantineIcon icon={IconSearch} size={14} />
                            }
                        />
                    </Box>
                    <Stack gap={2} className={styles.listScroll}>
                        {matches.length > 0 ? (
                            matches.map((memory) => (
                                <MemoryListRow
                                    key={memory.uuid}
                                    memory={memory}
                                    isSelected={selected?.slug === memory.slug}
                                    onSelect={() =>
                                        setSelectedSlug(memory.slug)
                                    }
                                />
                            ))
                        ) : (
                            <Text size="xs" c="dimmed" p="sm">
                                No memories match your search.
                            </Text>
                        )}
                    </Stack>
                </Stack>

                {selected ? (
                    <MemoryDetailPane
                        key={selected.slug}
                        projectUuid={projectUuid}
                        memory={selected}
                    />
                ) : (
                    <Box />
                )}
            </Box>
        );
    }

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            icon={IconNotebook}
            size="80rem"
            modalBodyProps={{ px: 0, py: 0 }}
            bodyScrollAreaMaxHeight="70vh"
            title="My memories"
            subtitle={`What the agents learned from your conversations in ${
                project?.name ?? 'this project'
            }. Only you and your organization's admins can see these.`}
        >
            {content}
        </MantineModal>
    );
};
