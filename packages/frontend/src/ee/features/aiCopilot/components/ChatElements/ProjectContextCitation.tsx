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
import { useAiProjectContextEntry } from '../../hooks/useAiProjectContextEntry';
import { ProjectContextDetailsModal } from '../ProjectContextDetails/ProjectContextDetails';
import styles from './Citation.module.css';

type ProjectContextCitationProps = {
    id?: string;
    'data-citation-index'?: number | string;
};

/**
 * Inline marker for a cited project-context entry. Shares the marker chrome
 * with `MemoryCitation` but resolves through the project-scoped entry endpoint
 * and is never gated on the memory org setting.
 */
export const ProjectContextCitation = ({
    id,
    'data-citation-index': citationIndex,
}: ProjectContextCitationProps) => {
    const [hasOpened, setHasOpened] = useState(false);
    const [detailsOpened, { open: openDetails, close: closeDetails }] =
        useDisclosure(false);
    const { projectUuid } = useParams();
    const slug = id?.replace(/^user-content-/, '');
    const entryQuery = useAiProjectContextEntry({
        projectUuid,
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
                            slug
                                ? `Show project context ${slug}`
                                : 'Show project context'
                        }
                        title={
                            slug
                                ? `Project context: ${slug}`
                                : 'Project context'
                        }
                        onClick={() => {
                            setHasOpened(true);
                            openDetails();
                        }}
                    >
                        {citationIndex ?? '·'}
                    </UnstyledButton>
                </HoverCard.Target>
                <HoverCard.Dropdown p="md" className={styles.card}>
                    {entryQuery.isLoading ? (
                        <Box py="md" ta="center">
                            <Loader size="xs" color="gray" />
                        </Box>
                    ) : entryQuery.data ? (
                        <Stack gap="sm">
                            <Group
                                justify="space-between"
                                align="flex-start"
                                wrap="nowrap"
                            >
                                <Text fw={650} size="sm" lh={1.3}>
                                    {entryQuery.data.title ??
                                        entryQuery.data.content}
                                </Text>
                                {entryQuery.data.status !== 'active' ? (
                                    <Badge
                                        color="gray"
                                        variant="light"
                                        size="xs"
                                    >
                                        removed
                                    </Badge>
                                ) : null}
                            </Group>
                            <Divider />
                            <Group justify="space-between" wrap="nowrap">
                                <Text size="xs" c="dimmed">
                                    Project context
                                </Text>
                                <UnstyledButton
                                    type="button"
                                    className={styles.detailsButton}
                                    onClick={openDetails}
                                >
                                    View entry
                                    <IconArrowRight size={12} />
                                </UnstyledButton>
                            </Group>
                        </Stack>
                    ) : (
                        <Text size="sm" c="dimmed">
                            Project context details unavailable
                        </Text>
                    )}
                </HoverCard.Dropdown>
            </HoverCard>

            {projectUuid && slug ? (
                <ProjectContextDetailsModal
                    opened={detailsOpened}
                    onClose={closeDetails}
                    projectUuid={projectUuid}
                    slug={slug}
                />
            ) : null}
        </>
    );
};
