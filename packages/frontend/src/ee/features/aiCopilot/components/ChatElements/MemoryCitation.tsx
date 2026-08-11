import {
    Badge,
    Box,
    Divider,
    Group,
    HoverCard,
    Loader,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowRight } from '@tabler/icons-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useAiAgentMemory } from '../../hooks/useAiAgentMemory';
import { useAiAgentMemoryEnabled } from '../../hooks/useAiOrganizationSettings';
import { MemoryDetailsModal } from '../MemoryDetails/MemoryDetails';
import { ContextCitation } from './ContextCitation';
import styles from './MemoryCitation.module.css';

type MemoryCitationProps = {
    id?: string;
    // Raw HTML attribute: may hold anything, not just the parsed union.
    source?: string;
    'data-citation-index'?: number | string;
};

export const MemoryCitation = ({
    id,
    source,
    'data-citation-index': citationIndex,
}: MemoryCitationProps) => {
    const [hasOpened, setHasOpened] = useState(false);
    const [detailsOpened, { open: openDetails, close: closeDetails }] =
        useDisclosure(false);
    const { projectUuid, agentUuid } = useParams();
    const memoryEnabled = useAiAgentMemoryEnabled();
    const slug = id?.replace(/^user-content-/, '');
    // Anything that isn't memory-tier (context, or malformed unknown source)
    // must not reach the memory hover.
    const isMemoryCitation = source === undefined || source === 'memory';
    const memoryQuery = useAiAgentMemory({
        projectUuid,
        agentUuid,
        slug,
        enabled: memoryEnabled && hasOpened && isMemoryCitation,
    });

    if (!isMemoryCitation) {
        // Unknown-source markers are malformed: render nothing.
        if (source !== 'context') return null;
        const numericIndex = Number(citationIndex);
        return (
            <ContextCitation
                slug={slug}
                index={Number.isFinite(numericIndex) ? numericIndex : undefined}
            />
        );
    }

    if (!memoryEnabled) {
        return (
            <Text component="span" className={styles.marker} aria-hidden>
                {citationIndex ?? '·'}
            </Text>
        );
    }

    return (
        <>
            <HoverCard
                width={360}
                shadow="md"
                radius="md"
                openDelay={180}
                closeDelay={120}
                withArrow
                withinPortal
                onOpen={() => setHasOpened(true)}
            >
                <HoverCard.Target>
                    <UnstyledButton
                        type="button"
                        className={styles.marker}
                        aria-label={
                            slug ? `Show memory ${slug}` : 'Show memory'
                        }
                        title={slug ? `Memory: ${slug}` : 'Memory'}
                        onClick={() => {
                            setHasOpened(true);
                            openDetails();
                        }}
                    >
                        {citationIndex ?? '·'}
                    </UnstyledButton>
                </HoverCard.Target>
                <HoverCard.Dropdown p="md" className={styles.card}>
                    {memoryQuery.isLoading ? (
                        <Box py="md" ta="center">
                            <Loader size="xs" color="gray" />
                        </Box>
                    ) : memoryQuery.data ? (
                        <Stack gap="sm">
                            <Group
                                justify="space-between"
                                align="flex-start"
                                wrap="nowrap"
                            >
                                <Text fw={650} size="sm" lh={1.3}>
                                    {memoryQuery.data.title}
                                </Text>
                                {memoryQuery.data.status !== 'active' ? (
                                    <Badge
                                        color="gray"
                                        variant="light"
                                        size="xs"
                                    >
                                        {memoryQuery.data.status}
                                    </Badge>
                                ) : null}
                            </Group>
                            <Divider />
                            <Group justify="space-between" wrap="nowrap">
                                <Text size="xs" c="dimmed">
                                    Saved{' '}
                                    {new Date(
                                        memoryQuery.data.generatedAt,
                                    ).toLocaleDateString()}
                                </Text>
                                <UnstyledButton
                                    type="button"
                                    className={styles.detailsButton}
                                    onClick={openDetails}
                                >
                                    View memory
                                    <IconArrowRight size={12} />
                                </UnstyledButton>
                            </Group>
                        </Stack>
                    ) : (
                        <Text size="sm" c="dimmed">
                            Memory details unavailable
                        </Text>
                    )}
                </HoverCard.Dropdown>
            </HoverCard>

            {memoryQuery.data && projectUuid && agentUuid ? (
                <MemoryDetailsModal
                    opened={detailsOpened}
                    onClose={closeDetails}
                    memory={memoryQuery.data}
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                />
            ) : null}
        </>
    );
};
