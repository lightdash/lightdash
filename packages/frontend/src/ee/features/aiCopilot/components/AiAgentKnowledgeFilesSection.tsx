import {
    AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
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
    ScrollArea,
    Skeleton,
    Stack,
    Table,
    Text,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconFileText,
    IconFolderOpen,
    IconInfoCircle,
    IconSparkles,
    IconTrash,
    IconUpload,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../../../components/common/EmptyState';
import EmptyStateLoader from '../../../../components/common/EmptyStateLoader';
import MantineIcon from '../../../../components/common/MantineIcon';
import useToaster from '../../../../hooks/toaster/useToaster';
import { formatFileSize } from '../../../../utils/formatters';
import {
    useAiAgentDocuments,
    useCreateAiAgentDocument,
    useDeleteAiAgentDocument,
} from '../hooks/useAiAgentDocuments';

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

const hasAllowedExtension = (filename: string): boolean => {
    const name = filename.toLowerCase();
    return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
};

type PendingUpload = {
    tempId: string;
    name: string;
    sizeBytes: number;
};

type Props = {
    agentUuid: string;
    projectUuid: string;
};

export const AiAgentKnowledgeFilesSection = ({
    agentUuid,
    projectUuid,
}: Props) => {
    const { data: documents, isLoading } = useAiAgentDocuments();
    const createDocument = useCreateAiAgentDocument();
    const deleteDocument = useDeleteAiAgentDocument();
    const { showToastError } = useToaster();

    const accessibleDocuments = useMemo<AiAgentDocumentSummary[]>(
        () =>
            (documents ?? []).filter(
                (doc) =>
                    doc.agentAccess.length === 0 ||
                    doc.agentAccess.includes(agentUuid),
            ),
        [documents, agentUuid],
    );

    const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        if (pendingUploads.length > 0) return;
        if (accessibleDocuments.length === 0) {
            setSelectedId(null);
            return;
        }
        const stillExists = accessibleDocuments.some(
            (doc) => doc.uuid === selectedId,
        );
        if (!stillExists) {
            setSelectedId(accessibleDocuments[0].uuid);
        }
    }, [accessibleDocuments, pendingUploads.length, selectedId]);

    const selectedPending = useMemo(
        () => pendingUploads.find((p) => p.tempId === selectedId) ?? null,
        [pendingUploads, selectedId],
    );
    const selectedDocument = useMemo(
        () =>
            selectedPending
                ? null
                : (accessibleDocuments.find((doc) => doc.uuid === selectedId) ??
                  null),
        [accessibleDocuments, selectedId, selectedPending],
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
                        agentAccess: [agentUuid],
                        projectUuid,
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
        [agentUuid, createDocument, projectUuid, showToastError],
    );

    const isEmpty =
        !isLoading &&
        pendingUploads.length === 0 &&
        accessibleDocuments.length === 0;

    return (
        <Stack gap="md">
            <Group justify="space-between" align="flex-start">
                <Box style={{ flex: 1 }}>
                    <Title order={6} c="ldGray.7" size="sm" fw={500}>
                        Knowledge documents
                    </Title>
                    <Text c="dimmed" size="xs">
                        Reference documents the agent retrieves from when
                        answering. A short summary is generated for each file so
                        the agent knows when to use it.
                    </Text>
                </Box>
                {!isEmpty && (
                    <FileButton
                        onChange={handleFiles}
                        accept={ACCEPT_ATTR}
                        multiple
                    >
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
                )}
            </Group>

            <Paper
                p={0}
                withBorder
                variant={isLoading || isEmpty ? 'dotted' : undefined}
                {...(!isEmpty && { h: 400 })}
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
                            titleProps={{ order: 5 }}
                            title="No knowledge document yet"
                        >
                            <FileButton
                                onChange={handleFiles}
                                accept={ACCEPT_ATTR}
                                multiple
                            >
                                {(props) => (
                                    <Button
                                        {...props}
                                        size="xs"
                                        leftSection={
                                            <MantineIcon icon={IconUpload} />
                                        }
                                    >
                                        Upload
                                    </Button>
                                )}
                            </FileButton>
                        </EmptyState>
                    </Center>
                ) : (
                    <Group align="flex-start" wrap="nowrap" h="100%">
                        <ScrollArea
                            h="100%"
                            type="hover"
                            style={{ flex: '1 1 70%', minWidth: 0 }}
                        >
                            <Table
                                stickyHeader
                                verticalSpacing="sm"
                                highlightOnHover
                            >
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th
                                            px="lg"
                                            style={{
                                                borderTopLeftRadius: '16px',
                                            }}
                                        >
                                            <Text size="xs" c="dimmed" fw={600}>
                                                NAME
                                            </Text>
                                        </Table.Th>
                                        <Table.Th w={100} ta="right" px="lg">
                                            <Text size="xs" c="dimmed" fw={600}>
                                                SIZE
                                            </Text>
                                        </Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {[
                                        ...pendingUploads.map((pending) => ({
                                            id: pending.tempId,
                                            name: pending.name,
                                            sizeBytes: pending.sizeBytes,
                                            summary: (
                                                <Skeleton visible radius="sm">
                                                    <Text
                                                        size="xs"
                                                        c="dimmed"
                                                        lineClamp={1}
                                                    >
                                                        Generating summary…
                                                    </Text>
                                                </Skeleton>
                                            ),
                                        })),
                                        ...accessibleDocuments.map((doc) => ({
                                            id: doc.uuid,
                                            name: doc.name,
                                            sizeBytes: doc.contentSizeBytes,
                                            summary: (
                                                <Text
                                                    size="xs"
                                                    c="dimmed"
                                                    lineClamp={1}
                                                >
                                                    {doc.summary.description}
                                                </Text>
                                            ),
                                        })),
                                    ].map((row) => {
                                        const isSelected =
                                            row.id === selectedId;
                                        return (
                                            <Table.Tr
                                                key={row.id}
                                                bg={
                                                    isSelected
                                                        ? 'ldGray.0'
                                                        : undefined
                                                }
                                            >
                                                <Table.Td>
                                                    <UnstyledButton
                                                        onClick={() =>
                                                            setSelectedId(
                                                                row.id,
                                                            )
                                                        }
                                                        w="100%"
                                                    >
                                                        <Group
                                                            gap="sm"
                                                            wrap="nowrap"
                                                        >
                                                            <MantineIcon
                                                                icon={
                                                                    IconFileText
                                                                }
                                                                color="dimmed"
                                                                style={{
                                                                    flexShrink: 0,
                                                                }}
                                                            />
                                                            <Stack
                                                                gap={2}
                                                                style={{
                                                                    minWidth: 0,
                                                                    flex: 1,
                                                                }}
                                                            >
                                                                <Text
                                                                    size="sm"
                                                                    fw={500}
                                                                    truncate
                                                                >
                                                                    {row.name}
                                                                </Text>
                                                                {row.summary}
                                                            </Stack>
                                                        </Group>
                                                    </UnstyledButton>
                                                </Table.Td>
                                                <Table.Td ta="right" pr="md">
                                                    <Text size="sm" c="dimmed">
                                                        {formatFileSize(
                                                            row.sizeBytes,
                                                        )}
                                                    </Text>
                                                </Table.Td>
                                            </Table.Tr>
                                        );
                                    })}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea>
                        {(selectedPending || selectedDocument) && (
                            <Paper
                                withBorder
                                m="-md"
                                mr="-xxs"
                                p="md"
                                bg="ldGray.0"
                                style={{
                                    flex: '1 1 30%',
                                    alignSelf: 'stretch',
                                }}
                            >
                                <Stack gap="sm" h="100%">
                                    <Group
                                        justify="space-between"
                                        wrap="nowrap"
                                    >
                                        <Stack gap={2} style={{ minWidth: 0 }}>
                                            <Text size="sm" fw={600} truncate>
                                                {selectedPending
                                                    ? selectedPending.name
                                                    : selectedDocument!.name}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {formatFileSize(
                                                    selectedPending
                                                        ? selectedPending.sizeBytes
                                                        : selectedDocument!
                                                              .contentSizeBytes,
                                                )}
                                            </Text>
                                        </Stack>
                                        {selectedDocument && (
                                            <Tooltip
                                                label="Delete document"
                                                position="left"
                                                withArrow
                                            >
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="red"
                                                    loading={
                                                        deleteDocument.isLoading &&
                                                        deleteDocument.variables ===
                                                            selectedDocument.uuid
                                                    }
                                                    onClick={() =>
                                                        deleteDocument.mutate(
                                                            selectedDocument.uuid,
                                                        )
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                    />
                                                </ActionIcon>
                                            </Tooltip>
                                        )}
                                    </Group>

                                    <Group gap={6}>
                                        <MantineIcon
                                            icon={IconSparkles}
                                            size="sm"
                                            color="gray"
                                        />
                                        <Text
                                            size="xs"
                                            c="dimmed"
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
                                            <Text size="sm">
                                                Generating a short summary so
                                                the agent knows when to
                                                reference this document. This
                                                usually takes a few seconds.
                                            </Text>
                                        </Skeleton>
                                    ) : (
                                        <>
                                            <Text size="sm" flex={1}>
                                                {
                                                    selectedDocument!.summary
                                                        .description
                                                }
                                            </Text>
                                            {(() => {
                                                const { warning, relevance } =
                                                    selectedDocument!.summary;
                                                if (
                                                    warning ||
                                                    relevance === 'low' ||
                                                    relevance === 'none'
                                                ) {
                                                    return (
                                                        <Paper
                                                            p="sm"
                                                            radius="sm"
                                                            withBorder
                                                            bg="yellow.0"
                                                        >
                                                            <Group
                                                                gap="xs"
                                                                wrap="nowrap"
                                                                align="flex-start"
                                                            >
                                                                <MantineIcon
                                                                    icon={
                                                                        IconAlertTriangle
                                                                    }
                                                                    size="sm"
                                                                    color="orange"
                                                                    style={{
                                                                        flexShrink: 0,
                                                                        marginTop: 2,
                                                                    }}
                                                                />
                                                                <Text
                                                                    size="xs"
                                                                    c="dimmed"
                                                                >
                                                                    {warning ??
                                                                        'This document does not appear to relate to the project — the agent may ignore it.'}
                                                                </Text>
                                                            </Group>
                                                        </Paper>
                                                    );
                                                }
                                                return null;
                                            })()}
                                            <Paper p="sm" radius="sm">
                                                <Group gap="xs" wrap="nowrap">
                                                    <MantineIcon
                                                        icon={IconInfoCircle}
                                                        size="sm"
                                                        color="gray"
                                                        style={{
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                    <Text size="xs" c="dimmed">
                                                        The agent uses this
                                                        summary to decide
                                                        whether to read the
                                                        file. The full text is
                                                        retrieved on demand.
                                                    </Text>
                                                </Group>
                                            </Paper>
                                        </>
                                    )}
                                </Stack>
                            </Paper>
                        )}
                    </Group>
                )}
            </Paper>
        </Stack>
    );
};
