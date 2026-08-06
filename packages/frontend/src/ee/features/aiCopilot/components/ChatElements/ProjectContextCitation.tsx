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
import { useAiProjectContextEntry } from '../../hooks/useAiProjectContext';
import { getProjectContextEntryTitle } from '../ProjectContextDetails/projectContextEntry';
import { ProjectContextEntryDetailsModal } from '../ProjectContextDetails/ProjectContextEntryDetails';
import styles from './Citation.module.css';

type ProjectContextCitationProps = {
    id?: string;
    'data-citation-index'?: number | string;
};

/** Sibling of MemoryCitation for `<ld-ctx-cite>`: same marker, curated source. */
export const ProjectContextCitation = ({
    id,
    'data-citation-index': citationIndex,
}: ProjectContextCitationProps) => {
    const [hasOpened, setHasOpened] = useState(false);
    const [detailsOpened, { open: openDetails, close: closeDetails }] =
        useDisclosure(false);
    const { projectUuid } = useParams();
    const entryId = id?.replace(/^user-content-/, '');
    const entryQuery = useAiProjectContextEntry({
        projectUuid,
        entryId,
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
                            entryId
                                ? `Show project context ${entryId}`
                                : 'Show project context'
                        }
                        title={
                            entryId
                                ? `Project context: ${entryId}`
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
                                    {getProjectContextEntryTitle(
                                        entryQuery.data,
                                    )}
                                </Text>
                                <Badge color="gray" variant="light" size="xs">
                                    {entryQuery.data.kind}
                                </Badge>
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
                            Project context unavailable
                        </Text>
                    )}
                </HoverCard.Dropdown>
            </HoverCard>

            {entryQuery.data && projectUuid ? (
                <ProjectContextEntryDetailsModal
                    opened={detailsOpened}
                    onClose={closeDetails}
                    entry={entryQuery.data}
                    projectUuid={projectUuid}
                />
            ) : null}
        </>
    );
};
