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
import { getContextEntryTitle } from '../../utils/contextEntry';
import { ContextEntryDetailsModal } from '../ContextEntryDetails/ContextEntryDetails';
// Same visual language as the memory citation marker
import styles from './MemoryCitation.module.css';

type ContextCitationProps = {
    slug?: string;
    index?: number | string;
};

export const ContextCitation = ({ slug, index }: ContextCitationProps) => {
    const [hasOpened, setHasOpened] = useState(false);
    const [detailsOpened, { open: openDetails, close: closeDetails }] =
        useDisclosure(false);
    const { projectUuid } = useParams();
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
                                ? `Show context entry ${slug}`
                                : 'Show context entry'
                        }
                        title={slug ? `Context: ${slug}` : 'Context'}
                        onClick={() => {
                            setHasOpened(true);
                            openDetails();
                        }}
                    >
                        {index ?? '·'}
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
                                    {getContextEntryTitle(entryQuery.data)}
                                </Text>
                                {entryQuery.data.status === 'removed' ? (
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
                            Context entry unavailable
                        </Text>
                    )}
                </HoverCard.Dropdown>
            </HoverCard>

            {entryQuery.data && projectUuid ? (
                <ContextEntryDetailsModal
                    opened={detailsOpened}
                    onClose={closeDetails}
                    entry={entryQuery.data}
                    projectUuid={projectUuid}
                />
            ) : null}
        </>
    );
};
