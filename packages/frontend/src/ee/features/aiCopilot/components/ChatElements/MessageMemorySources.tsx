import {
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
import { MemoryDetailsModal } from '../MemoryDetails/MemoryDetails';
import styles from './MessageMemorySources.module.css';

export const MessageSourcesToggle: FC<{
    count: number;
    expanded: boolean;
    onToggle: () => void;
}> = ({ count, expanded, onToggle }) => (
    <Button
        variant="subtle"
        color="gray"
        size="compact-xs"
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
            <Paper radius="md" p="sm" className={styles.card}>
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
            <Paper radius="md" p="sm" className={styles.cardUnavailable}>
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
                        <Text
                            size="sm"
                            fw={600}
                            lh={1.3}
                            lineClamp={1}
                            ta="left"
                        >
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

/**
 * Card grid for the memories a message cites inline via `<ld-mem-cite>`,
 * numbered to match the inline markers. Toggled by `MessageSourcesToggle`.
 */
export const MessageSourcesGrid: FC<{
    slugs: string[];
    projectUuid: string;
    agentUuid: string;
}> = ({ slugs, projectUuid, agentUuid }) => (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
        {slugs.map((slug, idx) => (
            <MemorySourceCard
                key={slug}
                slug={slug}
                index={idx + 1}
                projectUuid={projectUuid}
                agentUuid={agentUuid}
            />
        ))}
    </SimpleGrid>
);
