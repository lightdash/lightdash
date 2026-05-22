import {
    AI_AGENT_DOCUMENT_MAX_FILE_BYTES,
    AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
    AI_AGENT_DOCUMENT_SUPPORTED_FILE_EXTENSIONS,
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
    IconFileText,
    IconFolderOpen,
    IconSparkles,
    IconTrash,
    IconUpload,
} from '@tabler/icons-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { EmptyState } from '../../../../components/common/EmptyState';
import EmptyStateLoader from '../../../../components/common/EmptyStateLoader';
import MantineIcon from '../../../../components/common/MantineIcon';
import useToaster from '../../../../hooks/toaster/useToaster';
import { formatFileSize } from '../../../../utils/formatters';
import {
    useAiAgentDocuments,
    useDeleteAiAgentDocument,
    useUploadAiAgentDocument,
} from '../hooks/useAiAgentDocuments';
import { AiAgentDocumentRelevanceCard } from './AiAgentDocumentRelevanceCard';
import styles from './AiAgentKnowledgeFilesSection.module.css';
import { BookLoader } from './BookLoader';

const ACCEPT_ATTR = `${AI_AGENT_DOCUMENT_SUPPORTED_FILE_EXTENSIONS.join(
    ',',
)},text/markdown,text/plain,text/x-markdown,text/csv,application/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/pdf`;
const SUPPORTED_FILE_COPY =
    'Supports .md, .markdown, .txt, .csv, .docx, .doc, and .pdf.';
const LIMIT_COPY = `Max ${formatFileSize(
    AI_AGENT_DOCUMENT_MAX_FILE_BYTES,
)} file. Extracted text max ${formatFileSize(
    AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
)}.`;

const stripExtension = (filename: string): string =>
    filename.replace(/\.[^.]+$/, '');

const hasAllowedExtension = (filename: string): boolean => {
    const name = filename.toLowerCase();
    return AI_AGENT_DOCUMENT_SUPPORTED_FILE_EXTENSIONS.some((ext) =>
        name.endsWith(ext),
    );
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
    const uploadDocument = useUploadAiAgentDocument();
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

    const effectiveSelectedId = useMemo(() => {
        if (selectedId && pendingUploads.some((p) => p.tempId === selectedId)) {
            return selectedId;
        }
        if (
            selectedId &&
            accessibleDocuments.some((doc) => doc.uuid === selectedId)
        ) {
            return selectedId;
        }
        return accessibleDocuments[0]?.uuid ?? null;
    }, [accessibleDocuments, pendingUploads, selectedId]);

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
                : (accessibleDocuments.find(
                      (doc) => doc.uuid === effectiveSelectedId,
                  ) ?? null),
        [accessibleDocuments, effectiveSelectedId, selectedPending],
    );

    const resetFileInputRef = useRef<() => void>(null);

    const handleFiles = useCallback(
        async (files: File[] | null) => {
            resetFileInputRef.current?.();
            if (!files || files.length === 0) return;

            const queued: Array<{ file: File; pending: PendingUpload }> = [];
            for (const file of files) {
                if (
                    !hasAllowedExtension(file.name) ||
                    file.size > AI_AGENT_DOCUMENT_MAX_FILE_BYTES
                ) {
                    showToastError({
                        title: `Skipped ${file.name}`,
                        subtitle:
                            file.size > AI_AGENT_DOCUMENT_MAX_FILE_BYTES
                                ? `Exceeds ${formatFileSize(
                                      AI_AGENT_DOCUMENT_MAX_FILE_BYTES,
                                  )} limit.`
                                : SUPPORTED_FILE_COPY,
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
                    const created = await uploadDocument.mutateAsync({
                        file,
                        name: stripExtension(file.name),
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
        [agentUuid, projectUuid, showToastError, uploadDocument],
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
                    <Text c="dimmed" size="xs">
                        {SUPPORTED_FILE_COPY} {LIMIT_COPY}
                    </Text>
                </Box>
                {!isEmpty && (
                    <FileButton
                        onChange={handleFiles}
                        accept={ACCEPT_ATTR}
                        multiple
                        resetRef={resetFileInputRef}
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
                            <Stack gap="xs" align="center">
                                <Text size="xs" c="dimmed" ta="center">
                                    {SUPPORTED_FILE_COPY} {LIMIT_COPY}
                                </Text>
                                <FileButton
                                    onChange={handleFiles}
                                    accept={ACCEPT_ATTR}
                                    multiple
                                    resetRef={resetFileInputRef}
                                >
                                    {(props) => (
                                        <Button
                                            {...props}
                                            size="xs"
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconUpload}
                                                />
                                            }
                                        >
                                            Upload
                                        </Button>
                                    )}
                                </FileButton>
                            </Stack>
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
                                        <Table.Th w={200} ta="right" px="lg">
                                            <Text size="xs" c="dimmed" fw={600}>
                                                TEXT SIZE
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
                                            sizeLabel: `File ${formatFileSize(
                                                pending.sizeBytes,
                                            )}`,
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
                                            sizeLabel: `${formatFileSize(
                                                doc.contentSizeBytes,
                                            )}`,
                                        })),
                                    ].map((row) => {
                                        const isSelected =
                                            row.id === effectiveSelectedId;
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
                                                        {row.sizeLabel}
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
                                                {selectedPending
                                                    ? `File ${formatFileSize(
                                                          selectedPending.sizeBytes,
                                                      )}`
                                                    : `Extracted text ${formatFileSize(
                                                          selectedDocument!
                                                              .contentSizeBytes,
                                                      )}`}
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
                                        <Center flex={1} py="md">
                                            <BookLoader aria-label="Generating summary" />
                                        </Center>
                                    ) : (
                                        <>
                                            <ScrollArea
                                                flex={1}
                                                mih={0}
                                                offsetScrollbars
                                            >
                                                <Text
                                                    key={selectedDocument!.uuid}
                                                    size="sm"
                                                    className={
                                                        styles.summaryReveal
                                                    }
                                                >
                                                    {
                                                        selectedDocument!
                                                            .summary.description
                                                    }
                                                </Text>
                                            </ScrollArea>
                                            {selectedDocument && (
                                                <AiAgentDocumentRelevanceCard
                                                    summary={
                                                        selectedDocument!
                                                            .summary
                                                    }
                                                />
                                            )}
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
