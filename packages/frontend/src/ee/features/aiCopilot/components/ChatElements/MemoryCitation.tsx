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
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { IconArrowRight } from '@tabler/icons-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import { useAiAgentMemory } from '../../hooks/useAiAgentMemory';
import { getAiAgentMemoryPreview } from '../../utils/memory';
import { MemoryDetailsModal } from '../MemoryDetails/MemoryDetails';
import styles from './MemoryCitation.module.css';

type MemoryCitationProps = {
    id?: string;
    'data-memory-index'?: number | string;
};

export const MemoryCitation = ({
    id,
    'data-memory-index': memoryIndex,
}: MemoryCitationProps) => {
    const [hasOpened, setHasOpened] = useState(false);
    const [detailsOpened, { open: openDetails, close: closeDetails }] =
        useDisclosure(false);
    const { projectUuid, agentUuid } = useParams();
    const slug = id?.replace(/^user-content-/, '');
    const memoryQuery = useAiAgentMemory({
        projectUuid,
        agentUuid,
        slug,
        enabled: hasOpened,
    });

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
                        {memoryIndex ?? '·'}
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
                            <AiMarkdown className={styles.preview}>
                                {getAiAgentMemoryPreview(
                                    memoryQuery.data.rawMemory,
                                )}
                            </AiMarkdown>
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
                                    View details
                                    <IconArrowRight size={13} />
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
