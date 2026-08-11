import {
    Badge,
    Box,
    Button,
    Group,
    Paper,
    SimpleGrid,
    Skeleton,
    Stack,
    Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronUp,
    IconFileDescription,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { PolymorphicPaperButton } from '../../../../../components/common/PolymorphicPaperButton';
import { useAiAgentMemory } from '../../hooks/useAiAgentMemory';
import { useAiProjectContextEntry } from '../../hooks/useAiProjectContextEntry';
import { getContextEntryTitle } from '../../utils/contextEntry';
import { ContextEntryDetailsModal } from '../ContextEntryDetails/ContextEntryDetails';
import { MemoryDetailsModal } from '../MemoryDetails/MemoryDetails';
import styles from './MessageMemorySources.module.css';
import { type MessageCitationSource } from './useMessageCitationSources';

export const MessageSourcesToggle: FC<{
    count: number;
    expanded: boolean;
    onToggle: () => void;
}> = ({ count, expanded, onToggle }) => (
    <Button
        variant="subtle"
        color="gray"
        size="compact-xs"
        fw={500}
        className={styles.toggle}
        onClick={onToggle}
        leftSection={<MantineIcon icon={IconFileDescription} size={16} />}
        rightSection={
            <MantineIcon
                icon={expanded ? IconChevronUp : IconChevronDown}
                size={12}
            />
        }
    >
        {count} {count === 1 ? 'source' : 'sources'}
    </Button>
);

const MemorySourceCard: FC<{
    slug: string;
    index: number;
    projectUuid: string;
    agentUuid: string;
}> = ({ slug, index, projectUuid, agentUuid }) => {
    const [detailsOpened, { open: openDetails, close: closeDetails }] =
        useDisclosure(false);
    const memoryQuery = useAiAgentMemory({ projectUuid, agentUuid, slug });

    if (memoryQuery.isLoading) {
        return (
            <Paper withBorder radius="md" p="sm" className={styles.card}>
                <Group gap="sm" wrap="nowrap">
                    <Box className={styles.indexChip}>{index}</Box>
                    <Stack gap={6} w="100%">
                        <Skeleton height={10} width="70%" />
                        <Skeleton height={8} width="40%" />
                    </Stack>
                </Group>
            </Paper>
        );
    }

    if (!memoryQuery.data) {
        return (
            <Paper
                withBorder
                radius="md"
                p="sm"
                className={styles.cardUnavailable}
            >
                <Group gap="sm" wrap="nowrap">
                    <Box className={styles.indexChip}>{index}</Box>
                    <Text size="sm" c="dimmed">
                        Memory unavailable
                    </Text>
                </Group>
            </Paper>
        );
    }

    const memory = memoryQuery.data;

    return (
        <>
            <PolymorphicPaperButton
                component="button"
                type="button"
                withBorder
                radius="md"
                p="sm"
                className={styles.card}
                aria-label={`Show memory ${memory.title}`}
                onClick={openDetails}
            >
                <Group gap="sm" wrap="nowrap" align="flex-start">
                    <Box className={styles.indexChip}>{index}</Box>
                    <Stack gap={2} miw={0}>
                        <Text className={styles.cardTitle} lineClamp={1}>
                            {memory.title}
                        </Text>
                        <Text size="xs" c="dimmed" ta="left">
                            Saved{' '}
                            {new Date(memory.generatedAt).toLocaleDateString()}
                        </Text>
                    </Stack>
                </Group>
            </PolymorphicPaperButton>
            <MemoryDetailsModal
                opened={detailsOpened}
                onClose={closeDetails}
                memory={memory}
                projectUuid={projectUuid}
                agentUuid={agentUuid}
            />
        </>
    );
};

const ContextSourceCard: FC<{
    slug: string;
    index: number;
    projectUuid: string;
}> = ({ slug, index, projectUuid }) => {
    const [detailsOpened, { open: openDetails, close: closeDetails }] =
        useDisclosure(false);
    const entryQuery = useAiProjectContextEntry({ projectUuid, slug });

    if (entryQuery.isLoading) {
        return (
            <Paper withBorder radius="md" p="sm" className={styles.card}>
                <Group gap="sm" wrap="nowrap">
                    <Box className={styles.indexChip}>{index}</Box>
                    <Stack gap={6} w="100%">
                        <Skeleton height={10} width="70%" />
                        <Skeleton height={8} width="40%" />
                    </Stack>
                </Group>
            </Paper>
        );
    }

    if (!entryQuery.data) {
        return (
            <Paper
                withBorder
                radius="md"
                p="sm"
                className={styles.cardUnavailable}
            >
                <Group gap="sm" wrap="nowrap">
                    <Box className={styles.indexChip}>{index}</Box>
                    <Text size="sm" c="dimmed">
                        Context entry unavailable
                    </Text>
                </Group>
            </Paper>
        );
    }

    const entry = entryQuery.data;
    const title = getContextEntryTitle(entry);

    return (
        <>
            <PolymorphicPaperButton
                component="button"
                type="button"
                withBorder
                radius="md"
                p="sm"
                className={styles.card}
                aria-label={`Show context entry ${title}`}
                onClick={openDetails}
            >
                <Group gap="sm" wrap="nowrap" align="flex-start">
                    <Box className={styles.indexChip}>{index}</Box>
                    <Stack gap={2} miw={0}>
                        <Group gap={6} wrap="nowrap">
                            <Text className={styles.cardTitle} lineClamp={1}>
                                {title}
                            </Text>
                            {entry.status === 'removed' ? (
                                <Badge color="gray" variant="light" size="xs">
                                    removed
                                </Badge>
                            ) : null}
                        </Group>
                        <Text size="xs" c="dimmed" ta="left">
                            {entry.status === 'removed'
                                ? 'No longer in project context'
                                : 'Project context'}
                        </Text>
                    </Stack>
                </Group>
            </PolymorphicPaperButton>
            <ContextEntryDetailsModal
                opened={detailsOpened}
                onClose={closeDetails}
                entry={entry}
                projectUuid={projectUuid}
            />
        </>
    );
};

/**
 * Card grid for the sources a message cites inline via `<ld-mem-cite>`
 * (memories and project-context entries), numbered to match the unified
 * inline markers. Toggled by `MessageSourcesToggle`.
 */
export const MessageSourcesGrid: FC<{
    citations: MessageCitationSource[];
    projectUuid: string;
    agentUuid: string;
}> = ({ citations, projectUuid, agentUuid }) => (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
        {citations.map((citation) =>
            citation.source === 'memory' ? (
                <MemorySourceCard
                    key={`memory:${citation.slug}`}
                    slug={citation.slug}
                    index={citation.index}
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                />
            ) : (
                <ContextSourceCard
                    key={`context:${citation.slug}`}
                    slug={citation.slug}
                    index={citation.index}
                    projectUuid={projectUuid}
                />
            ),
        )}
    </SimpleGrid>
);
