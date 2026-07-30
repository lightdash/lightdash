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
import { useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import Callout from '../../../../../components/common/Callout';
import MantineModal from '../../../../../components/common/MantineModal';
import {
    getMarkdownPlainText,
    parseAiAgentMemorySections,
} from '../../utils/memory';
import { MEMORY_SCOPE_LABELS } from '../Admin/memoryScope';
import styles from './MemoryDetails.module.css';
import { MemoryStatusAction, MemoryStatusMenu } from './MemoryStatusControls';

type Memory = ApiAiAgentMemoryResponse['results'];

type MemoryDetailsProps = {
    memory: Memory;
    projectUuid: string;
    // Null when the memory isn't being viewed through an agent
    agentUuid: string | null;
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

const Disclosure: FC<{
    value: string;
    label: string;
    preview: string;
    isOpen: boolean;
    children: ReactNode;
}> = ({ value, label, preview, isOpen, children }) => (
    <Accordion.Item value={value}>
        <Accordion.Control>
            <Box className={styles.disclosureRow}>
                <Text className={styles.disclosureLabelText}>{label}</Text>
                {isOpen ? null : (
                    <Text className={styles.disclosurePreview} lineClamp={1}>
                        {preview}
                    </Text>
                )}
            </Box>
        </Accordion.Control>
        <Accordion.Panel>{children}</Accordion.Panel>
    </Accordion.Item>
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
    const [openSections, setOpenSections] = useState<string[]>([]);
    const replacementPath =
        memory.replacementSlug && agentUuid
            ? `/projects/${projectUuid}/ai-agents/${agentUuid}/memories/${memory.replacementSlug}`
            : null;
    const sources =
        memory.provenance.type === 'source_thread'
            ? [memory.provenance.source]
            : memory.provenance.sources;
    const sections = parseAiAgentMemorySections(memory.rawMemory);
    const sourcePreview =
        sources.length > 0
            ? sources
                  .map((source) => source.threadTitle ?? 'AI agent thread')
                  .join(', ')
            : 'No source threads recorded';

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
                    value={openSections}
                    onChange={setOpenSections}
                    className={styles.disclosures}
                    classNames={{
                        item: styles.disclosureItem,
                        control: styles.disclosureControl,
                        label: styles.disclosureLabel,
                        chevron: styles.disclosureChevron,
                        panel: styles.disclosurePanel,
                        content: styles.disclosureContent,
                    }}
                >
                    {sections.evidence ? (
                        <Disclosure
                            value="evidence"
                            label="Evidence"
                            preview={getMarkdownPlainText(sections.evidence)}
                            isOpen={openSections.includes('evidence')}
                        >
                            <AiMarkdown className={styles.disclosureMarkdown}>
                                {sections.evidence}
                            </AiMarkdown>
                        </Disclosure>
                    ) : null}

                    {sections.apply ? (
                        <Disclosure
                            value="apply"
                            label="Apply"
                            preview={getMarkdownPlainText(sections.apply)}
                            isOpen={openSections.includes('apply')}
                        >
                            <AiMarkdown className={styles.disclosureMarkdown}>
                                {sections.apply}
                            </AiMarkdown>
                        </Disclosure>
                    ) : null}

                    <Disclosure
                        value="source"
                        label="Source"
                        preview={sourcePreview}
                        isOpen={openSections.includes('source')}
                    >
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
                    </Disclosure>
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
