import type {
    AiAgentMemorySource,
    AiProjectContextTypedObjectRef,
    ApiAiAgentMemoryResponse,
} from '@lightdash/common';
import {
    Accordion,
    ActionIcon,
    Anchor,
    Badge,
    Box,
    Divider,
    Group,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconArrowRight,
    IconExternalLink,
    IconHistory,
    IconInfoCircle,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import Callout from '../../../../../components/common/Callout';
import MantineModal from '../../../../../components/common/MantineModal';
import { parseAiAgentMemorySections } from '../../utils/memory';
import { MEMORY_SCOPE_LABELS } from '../Admin/memoryScope';
import styles from './MemoryDetails.module.css';
import { MemoryStatusAction, MemoryStatusMenu } from './MemoryStatusControls';

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

const RailRow: FC<{ label: ReactNode; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Group className={styles.railRow} wrap="nowrap" gap="sm">
        <Box className={styles.railLabel}>{label}</Box>
        <Box className={styles.railValue}>{children}</Box>
    </Group>
);

const DisclosureLabel: FC<{ title: string; description: string }> = ({
    title,
    description,
}) => (
    <Box>
        <Text className={styles.disclosureTitle}>{title}</Text>
        <Text className={styles.disclosureDescription}>{description}</Text>
    </Box>
);

const SourceRow: FC<{
    source: AiAgentMemorySource;
    projectUuid: string;
}> = ({ source, projectUuid }) => {
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
    const sections = parseAiAgentMemorySections(memory.rawMemory);
    const sourceDescription =
        memory.provenance.type === 'consolidated'
            ? sources.length > 0
                ? `Consolidated from ${sources.length} memories`
                : 'Consolidated memory'
            : 'Extracted from one thread';

    return (
        <Box className={styles.layout}>
            <Stack className={styles.main} gap={0}>
                {memory.status !== 'active' ? (
                    <Callout
                        mb="xl"
                        color="gray"
                        variant="info"
                        title={`This memory is ${memory.status}`}
                        icon={<IconHistory size={17} />}
                        classNames={{
                            title: styles.statusCalloutText,
                            message: styles.statusCalloutText,
                        }}
                    >
                        {replacementPath ? (
                            <Anchor
                                component={Link}
                                to={replacementPath}
                                c="ldGray.8"
                                fz="xs"
                                fw={600}
                            >
                                View the current memory
                            </Anchor>
                        ) : (
                            'It remains available for audit history.'
                        )}
                    </Callout>
                ) : null}

                <Stack gap="md">
                    <Text className={styles.sectionLabel}>Memory</Text>
                    <AiMarkdown className={styles.memoryContent}>
                        {sections.memory}
                    </AiMarkdown>
                </Stack>

                <Accordion
                    multiple
                    defaultValue={[]}
                    className={styles.disclosures}
                    classNames={{
                        item: styles.disclosureItem,
                        control: styles.disclosureControl,
                        label: styles.disclosureLabel,
                        chevron: styles.disclosureChevron,
                        content: styles.disclosureContent,
                    }}
                >
                    {sections.evidence ? (
                        <Accordion.Item value="evidence">
                            <Accordion.Control>
                                <DisclosureLabel
                                    title="Evidence"
                                    description="Why this memory was learned"
                                />
                            </Accordion.Control>
                            <Accordion.Panel>
                                <AiMarkdown
                                    className={styles.disclosureMarkdown}
                                >
                                    {sections.evidence}
                                </AiMarkdown>
                            </Accordion.Panel>
                        </Accordion.Item>
                    ) : null}

                    {sections.apply ? (
                        <Accordion.Item value="apply">
                            <Accordion.Control>
                                <DisclosureLabel
                                    title="Apply"
                                    description="When and how to use it"
                                />
                            </Accordion.Control>
                            <Accordion.Panel>
                                <AiMarkdown
                                    className={styles.disclosureMarkdown}
                                >
                                    {sections.apply}
                                </AiMarkdown>
                            </Accordion.Panel>
                        </Accordion.Item>
                    ) : null}

                    <Accordion.Item value="source">
                        <Accordion.Control>
                            <DisclosureLabel
                                title="Source"
                                description={sourceDescription}
                            />
                        </Accordion.Control>
                        <Accordion.Panel>
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
                        </Accordion.Panel>
                    </Accordion.Item>
                </Accordion>
            </Stack>

            <Divider orientation="vertical" className={styles.divider} />

            <Stack className={styles.rail} gap={0}>
                <RailRow label="Status">
                    <MemoryStatusMenu
                        projectUuid={projectUuid}
                        memoryUuid={memory.uuid}
                        slug={memory.slug}
                        status={memory.status}
                    />
                </RailRow>
                <RailRow
                    label={
                        <Group gap="two" wrap="nowrap">
                            Scope
                            <Tooltip
                                label="Scope guides how the agent uses this memory. All memories remain private to the user by default."
                                multiline
                                w={260}
                                withinPortal
                            >
                                <ActionIcon
                                    aria-label="About memory scope"
                                    color="gray"
                                    size="xs"
                                    variant="transparent"
                                >
                                    <IconInfoCircle size={13} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    }
                >
                    <Text className={styles.railText}>
                        {MEMORY_SCOPE_LABELS[memory.scope]}
                    </Text>
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
        modalBodyProps={{ py: 'lg' }}
        bodyScrollAreaMaxHeight="calc(85vh - 120px)"
        headerActions={
            <MemoryStatusAction
                projectUuid={projectUuid}
                memoryUuid={memory.uuid}
                slug={memory.slug}
                status={memory.status}
            />
        }
    >
        <MemoryDetails
            memory={memory}
            projectUuid={projectUuid}
            agentUuid={agentUuid}
        />
    </MantineModal>
);
