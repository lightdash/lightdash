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
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useProjectUuid } from '../../../../../hooks/useProjectUuid';
import { useAiAgentMemory } from '../../hooks/useAiAgentMemory';
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
    const { t } = useTranslation('aiCopilotChat');
    const [hasOpened, setHasOpened] = useState(false);
    const [detailsOpened, { open: openDetails, close: closeDetails }] =
        useDisclosure(false);
    const { agentUuid } = useParams();
    const projectUuid = useProjectUuid();
    const slug = id?.replace(/^user-content-/, '');
    // Citations in old threads keep resolving after memories are disabled
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
                openDelay={180}
                closeDelay={120}
                withArrow
                onOpen={() => setHasOpened(true)}
            >
                <HoverCard.Target>
                    <UnstyledButton
                        type="button"
                        className={styles.marker}
                        aria-label={
                            slug
                                ? t('memory.showWithSlug', { slug })
                                : t('memory.show')
                        }
                        title={
                            slug
                                ? t('memory.titleWithSlug', { slug })
                                : t('memory.title')
                        }
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
                                <Text fw={600} size="sm" lh={1.3}>
                                    {memoryQuery.data.title}
                                </Text>
                                {memoryQuery.data.status !== 'active' ? (
                                    <Badge size="xs">
                                        {memoryQuery.data.status}
                                    </Badge>
                                ) : null}
                            </Group>
                            <Divider />
                            <Group justify="space-between" wrap="nowrap">
                                <Text size="xs" c="dimmed">
                                    {t('memory.saved', {
                                        date: new Date(
                                            memoryQuery.data.generatedAt,
                                        ).toLocaleDateString(),
                                    })}
                                </Text>
                                <UnstyledButton
                                    type="button"
                                    className={styles.detailsButton}
                                    onClick={openDetails}
                                >
                                    {t('memory.view')}
                                    <IconArrowRight size={12} />
                                </UnstyledButton>
                            </Group>
                        </Stack>
                    ) : (
                        <Text size="sm" c="dimmed">
                            {t('memory.unavailable')}
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
