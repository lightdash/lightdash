import { type AiAgentUserMemoryItem } from '@lightdash/common';
import {
    Box,
    Group,
    Stack,
    Text,
    TextInput,
    UnstyledButton,
} from '@mantine/core';
import { IconNotebook, IconSearch } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import EmptyStateLoader from '../../../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../../../components/common/InlineErrorState';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { useProject } from '../../../../../hooks/useProject';
import {
    useMyAiAgentMemories,
    useMyAiAgentMemory,
} from '../../hooks/useAiAgentMemory';
import { MemoryActions } from '../MemoryDetails/MemoryActions';
import { MemoryDetails } from '../MemoryDetails/MemoryDetails';
import styles from './MyMemoriesModal.module.css';

type MyMemoriesModalProps = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
};

const MemoryListRow: FC<{
    memory: AiAgentUserMemoryItem;
    isSelected: boolean;
    onSelect: () => void;
}> = ({ memory, isSelected, onSelect }) => {
    const { t } = useTranslation('aiAgent');
    return (
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
                    {memory.citedCount === 0
                        ? t('myMemories.neverCited')
                        : t('myMemories.cited', {
                              count: memory.citedCount,
                              formatted: memory.citedCount.toLocaleString(),
                          })}
                </Text>
            </Box>
        </UnstyledButton>
    );
};

const MemoryDetailPane: FC<{
    projectUuid: string;
    memory: AiAgentUserMemoryItem;
}> = ({ projectUuid, memory }) => {
    const { t } = useTranslation('aiAgent');
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
                    <MemoryActions
                        projectUuid={projectUuid}
                        memory={memoryQuery.data}
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
                            message={t('memory.loadFailed')}
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
    const { t } = useTranslation('aiAgent');
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
                message={t('myMemories.loadFailed')}
                onRetry={() => void memoriesQuery.refetch()}
            />
        );
    } else if (memories.length === 0) {
        content = (
            <Stack gap="xs" className={styles.emptyState}>
                <Text size="sm" fw={500}>
                    {t('myMemories.empty')}
                </Text>
                <Text size="sm" c="dimmed">
                    {t('myMemories.emptyDescription')}
                </Text>
            </Stack>
        );
    } else {
        content = (
            <Box className={styles.layout} data-tour="my-memories-modal">
                <Stack gap={0} className={styles.list}>
                    <Box className={styles.search}>
                        <TextInput
                            size="xs"
                            placeholder={t('myMemories.search')}
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
                                {t('myMemories.noMatches')}
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
            title={t('myMemories.title')}
            subtitle={
                project?.name
                    ? t('myMemories.subtitle', { project: project.name })
                    : t('myMemories.subtitleThisProject')
            }
        >
            {content}
        </MantineModal>
    );
};
