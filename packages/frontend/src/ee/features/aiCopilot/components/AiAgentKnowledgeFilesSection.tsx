import {
    AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
    assertUnreachable,
    type AiAgentDocumentSummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Center,
    FileButton,
    Group,
    Paper,
    Radio,
    ScrollArea,
    SimpleGrid,
    Skeleton,
    Stack,
    Text,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconEye,
    IconFileText,
    IconFolderOpen,
    IconMarkdown,
    IconSparkles,
    IconTrash,
    IconUpload,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { EmptyState } from '../../../../components/common/EmptyState';
import EmptyStateLoader from '../../../../components/common/EmptyStateLoader';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../../components/common/MantineModal';
import useToaster from '../../../../hooks/toaster/useToaster';
import { formatFileSize } from '../../../../utils/formatters';
import {
    useAiAgentDocuments,
    useCreateAiAgentDocument,
    useDeleteAiAgentDocument,
    useUpdateAiAgentDocument,
} from '../hooks/useAiAgentDocuments';
import { AiAgentDocumentRelevanceCard } from './AiAgentDocumentRelevanceCard';
import { AiAgentKnowledgeDocumentModal } from './AiAgentKnowledgeDocumentModal';
import styles from './AiAgentKnowledgeFilesSection.module.css';

const ACCEPT_ATTR =
    '.md,.markdown,.txt,text/markdown,text/plain,text/x-markdown';
const ALLOWED_EXTENSIONS = ['.md', '.markdown', '.txt'];

const normalizeMimeType = (file: File): string => {
    const lower = (file.type || '').toLowerCase();
    if (lower === 'text/x-markdown' || lower === 'text/markdown') {
        return 'text/markdown';
    }
    if (lower === 'text/plain') return 'text/plain';
    const name = file.name.toLowerCase();
    if (name.endsWith('.md') || name.endsWith('.markdown')) {
        return 'text/markdown';
    }
    return 'text/plain';
};

const stripExtension = (filename: string): string =>
    filename.replace(/\.[^.]+$/, '');

const getExtensionLabel = (filename: string, mimeType: string): string => {
    const match = filename.match(/\.([^.]+)$/);
    if (match) return match[1].toUpperCase();
    return mimeType === 'text/markdown' ? 'MD' : 'TXT';
};

const formatUploadDate = (date: Date): string => {
    const value = dayjs(date);
    return value.isSame(dayjs(), 'year')
        ? value.format('MMM D')
        : value.format('MMM D, YYYY');
};

const hasAllowedExtension = (filename: string): boolean => {
    const name = filename.toLowerCase();
    return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
};

const needsAttention = (document: AiAgentDocumentSummary): boolean =>
    !!document.summary.warning ||
    document.summary.relevance === 'low' ||
    document.summary.relevance === 'none';

type UsageMode = 'retrieve' | 'always';

const getUsageMode = (alwaysIncludeInContext: boolean): UsageMode =>
    alwaysIncludeInContext ? 'always' : 'retrieve';

type PendingUpload = {
    tempId: string;
    name: string;
    sizeBytes: number;
};

type PendingAction =
    | { type: 'delete'; document: AiAgentDocumentSummary }
    | { type: 'enableFullContext'; document: AiAgentDocumentSummary };

const getPendingActionModalConfig = (
    action: PendingAction,
): Pick<
    MantineModalProps,
    | 'confirmLabel'
    | 'description'
    | 'resourceLabel'
    | 'resourceType'
    | 'title'
    | 'variant'
> => {
    switch (action.type) {
        case 'delete':
            return {
                title: 'Delete knowledge document',
                variant: 'delete',
                resourceType: 'knowledge document',
                resourceLabel: action.document.name,
            };
        case 'enableFullContext':
            return {
                title: 'Always include in context?',
                description: `The full content of “${action.document.name}” will be added to every session. This uses more tokens and may increase response time.`,
                confirmLabel: 'Always include',
                variant: 'default',
            };
        default:
            return assertUnreachable(
                action,
                'Unknown knowledge document action',
            );
    }
};

type FileRowProps = {
    icon: typeof IconFileText;
    name: string;
    meta: ReactNode;
    warning: boolean;
    selected: boolean;
    onSelect: () => void;
};

const FileRow = ({
    icon,
    name,
    meta,
    warning,
    selected,
    onSelect,
}: FileRowProps) => (
    <UnstyledButton
        onClick={onSelect}
        className={styles.fileRow}
        data-selected={selected || undefined}
        // Anchor for scope walkthroughs (data-tour-via), by name
        data-tour-anchor="knowledge-document"
        data-tour-hint="Choose a document"
        data-tour-hint-named="Choose {value}"
        data-tour-value={name}
    >
        <Group gap="sm" wrap="nowrap" align="flex-start">
            <MantineIcon
                icon={icon}
                color="dimmed"
                className={styles.fileIcon}
            />
            <Stack gap={2} miw={0} flex={1}>
                <Group gap={6} wrap="nowrap">
                    <Text size="sm" fw={500} truncate>
                        {name}
                    </Text>
                    {warning && (
                        <Tooltip label="This document may not be relevant to the project">
                            <MantineIcon
                                icon={IconAlertTriangle}
                                color="orange"
                                size="sm"
                                className={styles.fileIcon}
                            />
                        </Tooltip>
                    )}
                </Group>
                {meta}
            </Stack>
        </Group>
    </UnstyledButton>
);

type UsageOptionProps = {
    value: UsageMode;
    title: string;
    description: string;
    disabled: boolean;
    checked: boolean;
};

const UsageOption = ({
    value,
    title,
    description,
    disabled,
    checked,
    ...others
}: UsageOptionProps & Record<`data-${string}`, string>) => (
    <Radio.Card
        value={value}
        className={styles.usageCard}
        disabled={disabled}
        aria-label={`${title}: ${description}`}
        {...others}
    >
        <Group gap="xs" wrap="nowrap" align="flex-start" p="sm">
            <Radio.Indicator
                size="xs"
                checked={checked}
                className={styles.usageIndicator}
            />
            <Stack gap={2}>
                <Text size="xs" fw={500}>
                    {title}
                </Text>
                <Text size="xs" c="dimmed">
                    {description}
                </Text>
            </Stack>
        </Group>
    </Radio.Card>
);

type Props = {
    agentUuid: string;
    projectUuid: string;
    /** Set to false when the surrounding section already carries the heading. */
    withHeading: boolean;
};

export const AiAgentKnowledgeFilesSection = ({
    agentUuid,
    projectUuid,
    withHeading,
}: Props) => {
    const { data, isLoading } = useAiAgentDocuments(projectUuid, agentUuid);
    const createDocument = useCreateAiAgentDocument(projectUuid, agentUuid);
    const deleteDocument = useDeleteAiAgentDocument(projectUuid, agentUuid);
    const updateDocument = useUpdateAiAgentDocument(projectUuid, agentUuid);
    const { showToastError } = useToaster();

    const documents = useMemo(() => data ?? [], [data]);

    const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(
        null,
    );
    const [viewingDocument, setViewingDocument] =
        useState<AiAgentDocumentSummary | null>(null);

    const effectiveSelectedId = useMemo(() => {
        if (selectedId && pendingUploads.some((p) => p.tempId === selectedId)) {
            return selectedId;
        }
        if (selectedId && documents.some((doc) => doc.uuid === selectedId)) {
            return selectedId;
        }
        return documents[0]?.uuid ?? null;
    }, [documents, pendingUploads, selectedId]);

    const selectedPending = useMemo(
        () =>
            pendingUploads.find((p) => p.tempId === effectiveSelectedId) ??
            null,
        [pendingUploads, effectiveSelectedId],
    );
    const selectedDocument = useMemo(
        () =>
            selectedPending
                ? null
                : (documents.find((doc) => doc.uuid === effectiveSelectedId) ??
                  null),
        [documents, effectiveSelectedId, selectedPending],
    );

    const handleFiles = useCallback(
        async (files: File[] | null) => {
            if (!files || files.length === 0) return;

            const queued: Array<{ file: File; pending: PendingUpload }> = [];
            for (const file of files) {
                if (
                    !hasAllowedExtension(file.name) ||
                    file.size > AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES
                ) {
                    showToastError({
                        title: `Skipped ${file.name}`,
                        subtitle:
                            file.size > AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES
                                ? `Exceeds ${formatFileSize(
                                      AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
                                  )} limit.`
                                : 'Only .md and .txt files are supported.',
                    });
                    continue;
                }
                const tempId =
                    typeof crypto !== 'undefined' && 'randomUUID' in crypto
                        ? crypto.randomUUID()
                        : `pending-${Date.now()}-${Math.random()}`;
                queued.push({
                    file,
                    pending: {
                        tempId,
                        name: stripExtension(file.name),
                        sizeBytes: file.size,
                    },
                });
            }

            if (queued.length === 0) return;

            // Stage every valid upload as a pending row in a single render.
            setPendingUploads((prev) => [
                ...queued.map((q) => q.pending),
                ...prev,
            ]);
            setSelectedId(queued[0].pending.tempId);

            // Process sequentially — server enforces org quota per call,
            // parallel uploads could race past it.
            for (const { file, pending } of queued) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    const content = await file.text();
                    // eslint-disable-next-line no-await-in-loop
                    const created = await createDocument.mutateAsync({
                        name: stripExtension(file.name),
                        originalFilename: file.name,
                        mimeType: normalizeMimeType(file),
                        content,
                    });
                    setSelectedId((current) =>
                        current === pending.tempId ? created.uuid : current,
                    );
                } catch {
                    // toaster handled by the mutation hook
                } finally {
                    setPendingUploads((prev) =>
                        prev.filter((p) => p.tempId !== pending.tempId),
                    );
                }
            }
        },
        [createDocument, showToastError],
    );

    const handleUsageChange = useCallback(
        (document: AiAgentDocumentSummary, mode: UsageMode) => {
            if (mode === getUsageMode(document.alwaysIncludeInContext)) return;
            if (mode === 'always') {
                setPendingAction({ type: 'enableFullContext', document });
                return;
            }
            updateDocument.mutate({
                documentUuid: document.uuid,
                body: { alwaysIncludeInContext: false },
            });
        },
        [updateDocument],
    );

    const handleConfirmAction = useCallback(async () => {
        if (!pendingAction) return;

        try {
            switch (pendingAction.type) {
                case 'delete':
                    await deleteDocument.mutateAsync(
                        pendingAction.document.uuid,
                    );
                    break;
                case 'enableFullContext':
                    await updateDocument.mutateAsync({
                        documentUuid: pendingAction.document.uuid,
                        body: { alwaysIncludeInContext: true },
                    });
                    break;
                default:
                    assertUnreachable(
                        pendingAction,
                        'Unknown knowledge document action',
                    );
            }
            setPendingAction(null);
        } catch {
            // The mutation hook shows the error; keep the modal open for retry.
        }
    }, [deleteDocument, pendingAction, updateDocument]);

    const pendingActionLoading = useMemo(() => {
        if (!pendingAction) return false;

        switch (pendingAction.type) {
            case 'delete':
                return deleteDocument.isLoading;
            case 'enableFullContext':
                return updateDocument.isLoading;
            default:
                return assertUnreachable(
                    pendingAction,
                    'Unknown knowledge document action',
                );
        }
    }, [deleteDocument.isLoading, pendingAction, updateDocument.isLoading]);

    const isEmpty =
        !isLoading && pendingUploads.length === 0 && documents.length === 0;
    const fileCount = pendingUploads.length + documents.length;

    const uploadButton = (
        <FileButton onChange={handleFiles} accept={ACCEPT_ATTR} multiple>
            {(props) => (
                <Button
                    {...props}
                    size="xs"
                    leftSection={<MantineIcon icon={IconUpload} />}
                >
                    Upload
                </Button>
            )}
        </FileButton>
    );

    return (
        <Stack gap="md">
            {withHeading && (
                <Box>
                    <Title order={6} c="ldGray.7" size="sm" fw={500}>
                        Knowledge documents
                    </Title>
                    <Text c="dimmed" size="xs">
                        Reference documents can be retrieved when relevant or
                        always included in the agent context. A short summary is
                        generated for each file.
                    </Text>
                </Box>
            )}

            <Paper
                p={0}
                variant={isLoading || isEmpty ? 'dotted' : undefined}
                className={styles.panel}
            >
                {isLoading ? (
                    <Center>
                        <EmptyStateLoader />
                    </Center>
                ) : isEmpty ? (
                    <Center>
                        <EmptyState
                            icon={
                                <MantineIcon
                                    icon={IconFolderOpen}
                                    color="dimmed"
                                />
                            }
                            gap="xs"
                            titleProps={{ order: 6 }}
                            title="No knowledge document yet"
                        >
                            {uploadButton}
                        </EmptyState>
                    </Center>
                ) : (
                    <Group
                        align="stretch"
                        wrap="nowrap"
                        gap={0}
                        className={styles.layout}
                    >
                        <Box className={styles.listPane}>
                            <Stack gap={0} className={styles.listPaneInner}>
                                <Group
                                    justify="space-between"
                                    wrap="nowrap"
                                    px="md"
                                    py="sm"
                                    className={styles.listHeader}
                                >
                                    <Text size="sm" c="dimmed">
                                        {fileCount}{' '}
                                        {fileCount === 1 ? 'file' : 'files'}
                                    </Text>
                                    {uploadButton}
                                </Group>
                                <ScrollArea flex={1} mih={0} type="hover">
                                    <Stack gap={2} p="xs">
                                        {pendingUploads.map((pending) => (
                                            <FileRow
                                                key={pending.tempId}
                                                icon={IconFileText}
                                                name={pending.name}
                                                warning={false}
                                                selected={
                                                    pending.tempId ===
                                                    effectiveSelectedId
                                                }
                                                onSelect={() =>
                                                    setSelectedId(
                                                        pending.tempId,
                                                    )
                                                }
                                                meta={
                                                    <Skeleton
                                                        visible
                                                        radius="sm"
                                                    >
                                                        <Text
                                                            size="xs"
                                                            c="dimmed"
                                                        >
                                                            Generating summary…
                                                        </Text>
                                                    </Skeleton>
                                                }
                                            />
                                        ))}
                                        {documents.map((doc) => (
                                            <FileRow
                                                key={doc.uuid}
                                                icon={
                                                    doc.mimeType ===
                                                    'text/markdown'
                                                        ? IconMarkdown
                                                        : IconFileText
                                                }
                                                name={doc.name}
                                                warning={needsAttention(doc)}
                                                selected={
                                                    doc.uuid ===
                                                    effectiveSelectedId
                                                }
                                                onSelect={() =>
                                                    setSelectedId(doc.uuid)
                                                }
                                                meta={
                                                    <Text
                                                        size="xs"
                                                        c="dimmed"
                                                        truncate
                                                        // Walkthrough: an agent's knowledge documents.
                                                        // See scripts/scope-tours.
                                                        data-tour-scope="manage:AiAgentDocument"
                                                        data-tour-step="1"
                                                        data-tour-route="/projects/:projectUuid/ai-agents/:agentUuid/edit"
                                                        data-tour-label="Knowledge documents the agent can consult"
                                                        data-tour-docs="agents/effective-analytics-with-agents.mdx#knowledge-documents:1"
                                                        data-tour-return="none"
                                                        data-tour-resultdocs="agents/effective-analytics-with-agents.mdx#always-include-in-context:p2:1"
                                                    >
                                                        {formatFileSize(
                                                            doc.contentSizeBytes,
                                                        )}{' '}
                                                        ·{' '}
                                                        {doc.alwaysIncludeInContext
                                                            ? 'Always included'
                                                            : 'When relevant'}
                                                    </Text>
                                                }
                                            />
                                        ))}
                                    </Stack>
                                </ScrollArea>
                            </Stack>
                        </Box>

                        {(selectedPending || selectedDocument) && (
                            <ScrollArea
                                h={480}
                                type="hover"
                                className={styles.detailPane}
                            >
                                <Stack gap="md" p="lg">
                                    <Group
                                        justify="space-between"
                                        align="flex-start"
                                        wrap="nowrap"
                                    >
                                        <Stack gap={2} miw={0}>
                                            <Title order={5} lineClamp={1}>
                                                {selectedPending
                                                    ? selectedPending.name
                                                    : selectedDocument!.name}
                                            </Title>
                                            <Text size="xs" c="dimmed">
                                                {selectedPending
                                                    ? formatFileSize(
                                                          selectedPending.sizeBytes,
                                                      )
                                                    : [
                                                          getExtensionLabel(
                                                              selectedDocument!
                                                                  .originalFilename,
                                                              selectedDocument!
                                                                  .mimeType,
                                                          ),
                                                          formatFileSize(
                                                              selectedDocument!
                                                                  .contentSizeBytes,
                                                          ),
                                                          `Uploaded ${formatUploadDate(
                                                              selectedDocument!
                                                                  .createdAt,
                                                          )}`,
                                                      ].join(' · ')}
                                            </Text>
                                        </Stack>
                                        {selectedDocument && (
                                            <Group gap="xs" wrap="nowrap">
                                                <Button
                                                    variant="default"
                                                    size="xs"
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={IconEye}
                                                        />
                                                    }
                                                    onClick={() =>
                                                        setViewingDocument(
                                                            selectedDocument,
                                                        )
                                                    }
                                                    // Anchor for scope walkthroughs (data-tour-via)
                                                    data-tour-anchor="knowledge-document-open"
                                                    data-tour-hint="Open the document"
                                                >
                                                    Preview
                                                </Button>
                                                <Tooltip label="Delete document">
                                                    <ActionIcon
                                                        variant="default"
                                                        size="input-xs"
                                                        aria-label="Delete document"
                                                        loading={
                                                            deleteDocument.isLoading &&
                                                            deleteDocument.variables ===
                                                                selectedDocument.uuid
                                                        }
                                                        onClick={() =>
                                                            setPendingAction({
                                                                type: 'delete',
                                                                document:
                                                                    selectedDocument,
                                                            })
                                                        }
                                                    >
                                                        <MantineIcon
                                                            icon={IconTrash}
                                                            color="red"
                                                        />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </Group>
                                        )}
                                    </Group>

                                    <Stack gap="xs">
                                        <Group gap={6}>
                                            <MantineIcon
                                                icon={IconSparkles}
                                                color="indigo"
                                                size="sm"
                                            />
                                            <Text
                                                size="xs"
                                                c="indigo"
                                                tt="uppercase"
                                                fw={600}
                                            >
                                                {selectedPending
                                                    ? 'Generating summary'
                                                    : 'AI summary'}
                                            </Text>
                                        </Group>

                                        {selectedPending ? (
                                            <Skeleton visible radius="sm">
                                                <Text size="xs">
                                                    Generating a short summary
                                                    so the agent knows when to
                                                    reference this document.
                                                    This usually takes a few
                                                    seconds.
                                                </Text>
                                            </Skeleton>
                                        ) : (
                                            <Text
                                                key={selectedDocument!.uuid}
                                                size="xs"
                                                className={styles.summaryReveal}
                                                // Walkthrough: a look at the summary once the
                                                // document is chosen. See scripts/scope-tours.
                                                data-tour-scope="manage:AiAgentDocument"
                                                data-tour-look="1"
                                                data-tour-after='[data-tour-anchor="knowledge-document"][data-tour-value="Jaffle shop glossary"]'
                                                data-tour-label="Read the summary the agent sees"
                                                data-tour-docs="agents/effective-analytics-with-agents.mdx#how-they-work:2-3"
                                            >
                                                {
                                                    selectedDocument!.summary
                                                        .description
                                                }
                                            </Text>
                                        )}
                                    </Stack>

                                    {selectedDocument && (
                                        <>
                                            <AiAgentDocumentRelevanceCard
                                                summary={
                                                    selectedDocument.summary
                                                }
                                            />

                                            <Stack gap="xs">
                                                <Text size="xs" fw={500}>
                                                    How the agent uses it
                                                </Text>
                                                <Radio.Group
                                                    aria-label="How the agent uses this document"
                                                    value={getUsageMode(
                                                        selectedDocument.alwaysIncludeInContext,
                                                    )}
                                                    onChange={(value) =>
                                                        handleUsageChange(
                                                            selectedDocument,
                                                            value as UsageMode,
                                                        )
                                                    }
                                                >
                                                    <SimpleGrid
                                                        cols={2}
                                                        spacing="sm"
                                                    >
                                                        <UsageOption
                                                            value="retrieve"
                                                            title="Retrieve when relevant"
                                                            description="Searched only when a question needs it."
                                                            disabled={
                                                                updateDocument.isLoading
                                                            }
                                                            checked={
                                                                !selectedDocument.alwaysIncludeInContext
                                                            }
                                                        />
                                                        <UsageOption
                                                            value="always"
                                                            title="Always include"
                                                            description="Full document added to every session. Uses more tokens."
                                                            disabled={
                                                                updateDocument.isLoading
                                                            }
                                                            checked={
                                                                selectedDocument.alwaysIncludeInContext
                                                            }
                                                            // Walkthrough: an agent's knowledge documents.
                                                            // See scripts/scope-tours.
                                                            data-tour-scope="manage:AiAgentDocument"
                                                            data-tour-step="2"
                                                            data-tour-route="/projects/:projectUuid/ai-agents/:agentUuid/edit"
                                                            data-tour-label="Choose Always include"
                                                            data-tour-title="Always include a knowledge document in context"
                                                            data-tour-interactive="true"
                                                            data-tour-covers="view:AiAgentDocument"
                                                            data-tour-via='[data-tour-nav="ask-ai"] >> [data-tour-anchor="agent-selector"] >> [data-tour-anchor="agent-option"][data-tour-value="Jaffle analyst"] >> [data-tour-anchor="agent-settings"] >> [data-tour-anchor="knowledge-document"][data-tour-value="Jaffle shop glossary"] >> [data-tour-anchor="knowledge-document-open"] >> [data-tour-anchor="modal-close"]'
                                                            data-tour-then='[data-tour-anchor="modal-confirm"]'
                                                            data-tour-docs="agents/effective-analytics-with-agents.mdx#always-include-in-context:1"
                                                        />
                                                    </SimpleGrid>
                                                </Radio.Group>
                                            </Stack>
                                        </>
                                    )}
                                </Stack>
                            </ScrollArea>
                        )}
                    </Group>
                )}
            </Paper>
            <AiAgentKnowledgeDocumentModal
                agentUuid={agentUuid}
                document={viewingDocument}
                onClose={() => setViewingDocument(null)}
                projectUuid={projectUuid}
            />
            {pendingAction && (
                <MantineModal
                    opened
                    onClose={() => {
                        if (!pendingActionLoading) setPendingAction(null);
                    }}
                    {...getPendingActionModalConfig(pendingAction)}
                    onConfirm={handleConfirmAction}
                    confirmLoading={pendingActionLoading}
                    cancelDisabled={pendingActionLoading}
                    withCloseButton={!pendingActionLoading}
                />
            )}
        </Stack>
    );
};
