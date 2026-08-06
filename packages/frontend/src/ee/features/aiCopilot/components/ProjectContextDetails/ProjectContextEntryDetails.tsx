import type { AiProjectContextObjectRef } from '@lightdash/common';
import { Anchor, Badge, Box, Divider, Group, Stack, Text } from '@mantine/core';
import { IconBook2, IconExternalLink } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import MantineModal from '../../../../../components/common/MantineModal';
import {
    getProjectContextEntryTitle,
    PROJECT_CONTEXT_ENTRY_KIND_LABELS,
    type ProjectContextEntry,
} from './projectContextEntry';
import styles from './ProjectContextEntryDetails.module.css';

const getObjectLabel = (object: AiProjectContextObjectRef) => {
    if (typeof object === 'string') return object;
    return object.type === 'explore' ? object.name : object.fieldId;
};

// Legacy string refs name an explore; typed refs carry it explicitly.
const getObjectExplore = (object: AiProjectContextObjectRef) => {
    if (typeof object === 'string') return object;
    return object.type === 'explore' ? object.name : object.explore;
};

const getObjectDescription = (object: AiProjectContextObjectRef) => {
    if (typeof object === 'string' || object.type === 'explore') {
        return 'Explore';
    }
    return `Field in ${object.explore}`;
};

const RailRow: FC<{ label: ReactNode; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Group className={styles.railRow} wrap="nowrap" gap="sm">
        <Box className={styles.railLabel}>{label}</Box>
        <Box className={styles.railValue}>{children}</Box>
    </Group>
);

type ProjectContextEntryDetailsProps = {
    entry: ProjectContextEntry;
    projectUuid: string;
};

export const ProjectContextEntryDetails: FC<
    ProjectContextEntryDetailsProps
> = ({ entry, projectUuid }) => (
    <Box className={styles.layout}>
        <Stack className={styles.main} gap="md">
            <Text className={styles.sectionLabel}>Project context</Text>
            <AiMarkdown className={styles.entryContent}>
                {entry.content}
            </AiMarkdown>
        </Stack>

        <Divider orientation="vertical" className={styles.divider} />

        <Stack className={styles.rail} gap={0}>
            <RailRow label="Kind">
                <Text className={styles.railText}>
                    {PROJECT_CONTEXT_ENTRY_KIND_LABELS[entry.kind]}
                </Text>
            </RailRow>
            <RailRow label="Source">
                <Text className={styles.railText}>Curated by your team</Text>
            </RailRow>
            <RailRow label="Id">
                <Text className={styles.entryId} lineClamp={2}>
                    {entry.id}
                </Text>
            </RailRow>

            <Stack gap="sm" className={styles.railSection}>
                <Text className={styles.sectionLabel}>Terms</Text>
                {entry.terms.length > 0 ? (
                    <Group gap={6}>
                        {entry.terms.map((term) => (
                            <Badge
                                key={term}
                                variant="light"
                                color="gray"
                                tt="none"
                                size="sm"
                            >
                                {term}
                            </Badge>
                        ))}
                    </Group>
                ) : (
                    <Text size="xs" c="dimmed">
                        No retrieval terms
                    </Text>
                )}
            </Stack>

            <Stack gap="sm" className={styles.railSection}>
                <Text className={styles.sectionLabel}>Catalog objects</Text>
                {entry.objects.length > 0 ? (
                    <Stack gap={8}>
                        {entry.objects.map((object) => {
                            const explore = getObjectExplore(object);
                            return (
                                <Anchor
                                    key={`${explore}-${getObjectLabel(object)}`}
                                    component={Link}
                                    to={`/projects/${projectUuid}/tables/${encodeURIComponent(
                                        explore,
                                    )}`}
                                    className={styles.objectLink}
                                >
                                    <Box miw={0}>
                                        <Text size="xs" fw={550} lineClamp={1}>
                                            {getObjectLabel(object)}
                                        </Text>
                                        <Text
                                            size="xs"
                                            c="dimmed"
                                            lineClamp={1}
                                        >
                                            {getObjectDescription(object)}
                                        </Text>
                                    </Box>
                                    <IconExternalLink
                                        size={13}
                                        className={styles.objectLinkIcon}
                                    />
                                </Anchor>
                            );
                        })}
                    </Stack>
                ) : (
                    <Text size="xs" c="dimmed">
                        No catalog objects
                    </Text>
                )}
            </Stack>
        </Stack>
    </Box>
);

type ProjectContextEntryDetailsModalProps = ProjectContextEntryDetailsProps & {
    opened: boolean;
    onClose: () => void;
};

export const ProjectContextEntryDetailsModal: FC<
    ProjectContextEntryDetailsModalProps
> = ({ opened, onClose, entry, projectUuid }) => (
    <MantineModal
        opened={opened}
        onClose={onClose}
        size="72rem"
        icon={IconBook2}
        title={getProjectContextEntryTitle(entry)}
        cancelLabel={false}
        modalBodyProps={{ px: 0, py: 0 }}
        bodyScrollAreaMaxHeight="calc(85vh - 120px)"
    >
        <ProjectContextEntryDetails entry={entry} projectUuid={projectUuid} />
    </MantineModal>
);
