import type {
    AiAgentMemorySource,
    AiProjectContextTypedObjectRef,
    ApiAiAgentMemoryResponse,
} from '@lightdash/common';
import {
    Alert,
    Anchor,
    Badge,
    Box,
    Divider,
    getDefaultZIndex,
    Group,
    Stack,
    Text,
} from '@mantine-8/core';
import {
    IconArrowRight,
    IconExternalLink,
    IconHistory,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import MantineModal from '../../../../../components/common/MantineModal';
import styles from './MemoryDetails.module.css';

type Memory = ApiAiAgentMemoryResponse['results'];

type MemoryDetailsProps = {
    memory: Memory;
    projectUuid: string;
    agentUuid: string;
};

const getObjectLabel = (object: AiProjectContextTypedObjectRef) =>
    object.type === 'explore' ? object.name : object.fieldId;

const getObjectExplore = (object: AiProjectContextTypedObjectRef) =>
    object.type === 'explore' ? object.name : object.explore;

const RailRow: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Group className={styles.railRow} wrap="nowrap" gap="sm">
        <Text className={styles.railLabel}>{label}</Text>
        <Box className={styles.railValue}>{children}</Box>
    </Group>
);

const SourceRow: FC<{
    source: AiAgentMemorySource;
    projectUuid: string;
}> = ({ source, projectUuid }) => {
    if (!source.hasThreadAccess) {
        return (
            <Box className={styles.sourceRow}>
                <Text fw={550} size="sm">
                    Source thread
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                    Thread details are only visible to its owner and agent
                    managers.
                </Text>
            </Box>
        );
    }

    const threadPath = source.agentUuid
        ? `/projects/${projectUuid}/ai-agents/${source.agentUuid}/threads/${source.threadUuid}`
        : null;

    return (
        <Box className={styles.sourceRow}>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Box miw={0}>
                    <Text fw={550} size="sm" lineClamp={1}>
                        {source.threadTitle ?? 'AI agent thread'}
                    </Text>
                    <AiMarkdown className={styles.sourceSummary}>
                        {source.threadSummary}
                    </AiMarkdown>
                </Box>
                {threadPath ? (
                    <Anchor
                        component={Link}
                        to={threadPath}
                        className={styles.sourceLink}
                    >
                        Open thread
                        <IconArrowRight size={13} />
                    </Anchor>
                ) : null}
            </Group>
        </Box>
    );
};

export const MemoryDetails: FC<MemoryDetailsProps> = ({
    memory,
    projectUuid,
    agentUuid,
}) => {
    const replacementPath = memory.replacementSlug
        ? `/projects/${projectUuid}/ai-agents/${agentUuid}/memories/${memory.replacementSlug}`
        : null;
    const sources =
        memory.provenance.type === 'source_thread'
            ? [memory.provenance.source]
            : memory.provenance.sources;

    return (
        <Box className={styles.layout}>
            <Stack className={styles.main} gap={0}>
                {memory.status !== 'active' ? (
                    <Alert
                        mb="xl"
                        color="gray"
                        variant="light"
                        title={`This memory is ${memory.status}`}
                        icon={<IconHistory size={17} />}
                    >
                        {replacementPath ? (
                            <Anchor
                                component={Link}
                                to={replacementPath}
                                fw={600}
                            >
                                View the current memory
                            </Anchor>
                        ) : (
                            'It remains available for audit history.'
                        )}
                    </Alert>
                ) : null}

                <Stack gap="md">
                    <Text className={styles.sectionLabel}>Memory</Text>
                    <AiMarkdown className={styles.memoryContent}>
                        {memory.rawMemory}
                    </AiMarkdown>
                </Stack>

                <Stack gap="md" className={styles.section}>
                    <Group justify="space-between" align="baseline">
                        <Text className={styles.sectionLabel}>Source</Text>
                        <Text size="xs" c="dimmed">
                            {memory.provenance.type === 'consolidated'
                                ? sources.length > 0
                                    ? `Consolidated from ${sources.length} memories`
                                    : 'Consolidated memory'
                                : 'Extracted from one thread'}
                        </Text>
                    </Group>
                    <Box className={styles.sourceList}>
                        {sources.length > 0 ? (
                            sources.map((source) => (
                                <SourceRow
                                    key={source.slug}
                                    source={source}
                                    projectUuid={projectUuid}
                                />
                            ))
                        ) : (
                            <Text size="xs" c="dimmed" p="md">
                                No source threads recorded
                            </Text>
                        )}
                    </Box>
                </Stack>
            </Stack>

            <Divider orientation="vertical" className={styles.divider} />

            <Stack className={styles.rail} gap={0}>
                <RailRow label="Status">
                    <Group gap={8} wrap="nowrap">
                        <Box
                            className={styles.statusDot}
                            data-status={memory.status}
                        />
                        <Text className={styles.railText}>{memory.status}</Text>
                    </Group>
                </RailRow>
                <RailRow label="Saved">
                    <Text className={styles.railText}>
                        {new Date(memory.generatedAt).toLocaleDateString()}
                    </Text>
                </RailRow>
                <RailRow label="Citations">
                    <Text className={styles.railText}>
                        {memory.citedCount.toLocaleString()}
                    </Text>
                </RailRow>
                <RailRow label="Slug">
                    <Text className={styles.slug} lineClamp={2}>
                        {memory.slug}
                    </Text>
                </RailRow>

                <Stack gap="sm" className={styles.railSection}>
                    <Text className={styles.sectionLabel}>Terms</Text>
                    {memory.terms.length > 0 ? (
                        <Group gap={6}>
                            {memory.terms.map((term) => (
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
                    {memory.objects.length > 0 ? (
                        <Stack gap={8}>
                            {memory.objects.map((object) => {
                                const explore = getObjectExplore(object);
                                return (
                                    <Anchor
                                        key={`${object.type}-${explore}-${getObjectLabel(object)}`}
                                        component={Link}
                                        to={`/projects/${projectUuid}/tables/${encodeURIComponent(explore)}`}
                                        className={styles.objectLink}
                                    >
                                        <Box miw={0}>
                                            <Text
                                                size="xs"
                                                fw={550}
                                                lineClamp={1}
                                            >
                                                {getObjectLabel(object)}
                                            </Text>
                                            <Text
                                                size="xs"
                                                c="dimmed"
                                                lineClamp={1}
                                            >
                                                {object.type === 'field'
                                                    ? `Field in ${explore}`
                                                    : 'Explore'}
                                            </Text>
                                        </Box>
                                        <IconExternalLink size={13} />
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
};

type MemoryDetailsModalProps = MemoryDetailsProps & {
    opened: boolean;
    onClose: () => void;
};

export const MemoryDetailsModal: FC<MemoryDetailsModalProps> = ({
    opened,
    onClose,
    memory,
    projectUuid,
    agentUuid,
}) => (
    <MantineModal
        opened={opened}
        onClose={onClose}
        size="72rem"
        title={
            <Text component="span" className={styles.modalTitle} lineClamp={2}>
                {memory.title}
            </Text>
        }
        cancelLabel={false}
        modalRootProps={{ zIndex: getDefaultZIndex('overlay') }}
        modalBodyProps={{ py: 'lg' }}
        bodyScrollAreaMaxHeight="calc(85vh - 120px)"
    >
        <MemoryDetails
            memory={memory}
            projectUuid={projectUuid}
            agentUuid={agentUuid}
        />
    </MantineModal>
);
