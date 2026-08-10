import type {
    AiProjectContextEntryDetail,
    AiProjectContextObjectRef,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Button,
    Divider,
    Group,
    Loader,
    Stack,
    Text,
} from '@mantine/core';
import { IconBook2, IconExternalLink, IconHistory } from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import Callout from '../../../../../components/common/Callout';
import MantineModal from '../../../../../components/common/MantineModal';
import { useAiProjectContextEntry } from '../../hooks/useAiProjectContextEntry';
import styles from './ProjectContextDetails.module.css';

const KIND_LABELS: Record<AiProjectContextEntryDetail['kind'], string> = {
    definition: 'Definition',
    context: 'Context',
};

const getObjectLabel = (object: AiProjectContextObjectRef): string => {
    if (typeof object === 'string') return object;
    return object.type === 'explore' ? object.name : object.fieldId;
};

const getObjectExplore = (object: AiProjectContextObjectRef): string | null => {
    if (typeof object === 'string') return null;
    return object.type === 'explore' ? object.name : object.explore;
};

const RailRow: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Box className={styles.railRow}>
        <Text className={styles.railLabel}>{label}</Text>
        {children}
    </Box>
);

type ProjectContextDetailsProps = {
    entry: AiProjectContextEntryDetail;
    projectUuid: string;
    onOpenSuccessor: (slug: string) => void;
};

/**
 * Detail view for a cited project-context entry. Renders what the entry has —
 * hand-authored entries carry no title or apply note — with no memory-style
 * provenance pretense.
 */
export const ProjectContextDetails: FC<ProjectContextDetailsProps> = ({
    entry,
    projectUuid,
    onOpenSuccessor,
}) => (
    <Box className={styles.layout}>
        <Stack gap="md" miw={0}>
            {entry.status === 'removed' ? (
                <Callout
                    color="gray"
                    variant="info"
                    title="This entry is no longer in the project context"
                    icon={<IconHistory size={16} />}
                >
                    <Text size="xs">
                        It is kept so this citation still resolves to exactly
                        what the agent read.
                    </Text>
                    {entry.successorSlug ? (
                        <Button
                            variant="subtle"
                            color="gray"
                            size="compact-xs"
                            px={0}
                            onClick={() =>
                                onOpenSuccessor(entry.successorSlug!)
                            }
                        >
                            View the current entry
                        </Button>
                    ) : null}
                </Callout>
            ) : null}

            <Stack gap="xs">
                <Text className={styles.sectionLabel}>Entry</Text>
                <Box className={styles.content}>
                    <AiMarkdown>{entry.content}</AiMarkdown>
                </Box>
            </Stack>

            {entry.apply ? (
                <Stack gap="xs">
                    <Text className={styles.sectionLabel}>Apply</Text>
                    <Box className={styles.content}>
                        <AiMarkdown>{entry.apply}</AiMarkdown>
                    </Box>
                </Stack>
            ) : null}
        </Stack>

        <Divider orientation="vertical" className={styles.divider} />

        <Stack className={styles.rail}>
            <RailRow label="Kind">
                <Text className={styles.railValue}>
                    {KIND_LABELS[entry.kind]}
                </Text>
            </RailRow>
            <RailRow label="Citations">
                <Text className={styles.railValue}>
                    {entry.citedCount.toLocaleString()}
                </Text>
            </RailRow>
            <RailRow label="Entry id">
                <Text className={styles.slug}>{entry.id}</Text>
            </RailRow>
            <RailRow label="Slug">
                <Text className={styles.slug}>{entry.slug}</Text>
            </RailRow>

            {entry.terms.length > 0 ? (
                <Stack gap="xs">
                    <Text className={styles.sectionLabel}>Terms</Text>
                    <Group gap={4}>
                        {entry.terms.map((term) => (
                            <Badge
                                key={term}
                                color="gray"
                                variant="light"
                                size="sm"
                            >
                                {term}
                            </Badge>
                        ))}
                    </Group>
                </Stack>
            ) : null}

            {entry.objects.length > 0 ? (
                <Stack gap="xs">
                    <Text className={styles.sectionLabel}>Catalog objects</Text>
                    <Stack gap={4}>
                        {entry.objects.map((object) => {
                            const label = getObjectLabel(object);
                            const explore = getObjectExplore(object);
                            return explore ? (
                                <Anchor
                                    key={label}
                                    component={Link}
                                    className={styles.objectLink}
                                    to={`/projects/${projectUuid}/tables/${encodeURIComponent(
                                        explore,
                                    )}`}
                                >
                                    {label}
                                    <IconExternalLink size={12} />
                                </Anchor>
                            ) : (
                                <Text key={label} size="xs">
                                    {label}
                                </Text>
                            );
                        })}
                    </Stack>
                </Stack>
            ) : null}
        </Stack>
    </Box>
);

/**
 * Modal wrapper that owns the fetch, so a tombstoned entry can hand off to its
 * live successor without the caller re-resolving anything.
 */
export const ProjectContextDetailsModal: FC<{
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    slug: string;
}> = ({ opened, onClose, projectUuid, slug }) => {
    const [successorSlug, setSuccessorSlug] = useState<string | null>(null);
    const activeSlug = successorSlug ?? slug;
    const entryQuery = useAiProjectContextEntry({
        projectUuid,
        slug: activeSlug,
        enabled: opened,
    });

    const handleClose = () => {
        setSuccessorSlug(null);
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            size="60rem"
            icon={IconBook2}
            title={entryQuery.data?.title ?? 'Project context'}
            cancelLabel={false}
            modalBodyProps={{ px: 0, py: 0 }}
            bodyScrollAreaMaxHeight="calc(85vh - 120px)"
        >
            {entryQuery.isLoading ? (
                <Box py="xl" ta="center">
                    <Loader size="sm" color="gray" />
                </Box>
            ) : entryQuery.data ? (
                <ProjectContextDetails
                    entry={entryQuery.data}
                    projectUuid={projectUuid}
                    onOpenSuccessor={setSuccessorSlug}
                />
            ) : (
                <Box p="xl">
                    <Text size="sm" c="dimmed">
                        Unable to load this project context entry.
                    </Text>
                </Box>
            )}
        </MantineModal>
    );
};
