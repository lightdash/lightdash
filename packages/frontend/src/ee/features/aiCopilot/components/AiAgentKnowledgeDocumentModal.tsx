import {
    AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
    AI_AGENT_DOCUMENT_MAX_NAME_LENGTH,
    assertUnreachable,
    type AiAgentDocumentSummary,
} from '@lightdash/common';
import {
    Box,
    Button,
    Center,
    Group,
    Loader,
    Stack,
    Text,
    Textarea,
    TextInput,
    useComputedColorScheme,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconDownload, IconEdit } from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { useCallback, useMemo, useState } from 'react';
import remarkFrontmatter from 'remark-frontmatter';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import useToaster from '../../../../hooks/toaster/useToaster';
import { formatFileSize } from '../../../../utils/formatters';
import {
    markdownSanitizeRehypePlugins,
    mdEditorComponents,
    rehypeRemoveHeaderLinks,
    useMdEditorStyle,
} from '../../../../utils/markdownUtils';
import {
    useAiAgentDocumentContent,
    useUpdateAiAgentDocumentContent,
} from '../hooks/useAiAgentDocuments';

const MARKDOWN_REMARK_PLUGINS = [remarkFrontmatter];

type LoadedDocumentModalProps = {
    agentUuid: string;
    content: string;
    document: AiAgentDocumentSummary;
    onClose: () => void;
    projectUuid: string;
};

const LoadedDocumentModal = ({
    agentUuid,
    content,
    document,
    onClose,
    projectUuid,
}: LoadedDocumentModalProps) => {
    const colorScheme = useComputedColorScheme('light');
    const markdownStyle = useMdEditorStyle();
    const updateDocument = useUpdateAiAgentDocumentContent(
        projectUuid,
        agentUuid,
    );
    const { showToastError } = useToaster();
    const [mode, setMode] = useState<'view' | 'edit'>('view');
    const initialValues = useMemo(
        () => ({ name: document.name, content }),
        [content, document.name],
    );
    const form = useForm({ initialValues });
    const contentSizeBytes = new TextEncoder().encode(
        form.values.content,
    ).byteLength;
    const contentTooLarge =
        contentSizeBytes > AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES;
    const isMarkdown = document.mimeType === 'text/markdown';

    const handleDownload = useCallback(() => {
        const blob = new Blob([form.values.content], {
            type: `${document.mimeType};charset=utf-8`,
        });
        const url = URL.createObjectURL(blob);
        const anchor = window.document.createElement('a');
        anchor.href = url;
        anchor.download = document.originalFilename;
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }, [document.mimeType, document.originalFilename, form.values.content]);

    const handleCancelEdit = useCallback(() => {
        form.setValues(initialValues);
        form.resetDirty(initialValues);
        setMode('view');
    }, [form, initialValues]);

    const handleSave = useCallback(async () => {
        if (contentTooLarge) {
            showToastError({
                title: 'Document is too large',
                subtitle: `Content exceeds the ${formatFileSize(
                    AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
                )} limit.`,
            });
            return;
        }

        const values = {
            name: form.values.name.trim(),
            content: form.values.content,
        };
        try {
            await updateDocument.mutateAsync({
                documentUuid: document.uuid,
                body: values,
            });
            form.setValues(values);
            form.resetDirty(values);
            setMode('view');
        } catch {
            // The mutation hook shows the error; keep the editor open for retry.
        }
    }, [contentTooLarge, document.uuid, form, showToastError, updateDocument]);

    const saveDisabled =
        !form.isDirty() ||
        form.values.name.trim().length === 0 ||
        contentTooLarge;
    const headerActions = (() => {
        switch (mode) {
            case 'view':
                return (
                    <Group gap="xs">
                        <Button
                            size="xs"
                            variant="default"
                            leftSection={<MantineIcon icon={IconDownload} />}
                            onClick={handleDownload}
                        >
                            Download
                        </Button>
                        <Button
                            size="xs"
                            leftSection={<MantineIcon icon={IconEdit} />}
                            onClick={() => setMode('edit')}
                        >
                            Edit
                        </Button>
                    </Group>
                );
            case 'edit':
                return (
                    <Group gap="xs">
                        <Button
                            size="xs"
                            variant="default"
                            disabled={updateDocument.isLoading}
                            onClick={handleCancelEdit}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="xs"
                            disabled={saveDisabled}
                            loading={updateDocument.isLoading}
                            onClick={() => void handleSave()}
                        >
                            Save
                        </Button>
                    </Group>
                );
            default:
                return assertUnreachable(mode, 'Unknown document modal mode');
        }
    })();

    return (
        <MantineModal
            opened
            onClose={() => {
                if (!updateDocument.isLoading) onClose();
            }}
            title={
                mode === 'edit' ? 'Edit knowledge document' : form.values.name
            }
            fullScreen
            headerActions={headerActions}
            cancelLabel={false}
            confirmBeforeClose={
                !updateDocument.isLoading && mode === 'edit' && form.isDirty()
            }
            withCloseButton={!updateDocument.isLoading}
        >
            {mode === 'view' ? (
                isMarkdown ? (
                    <Box
                        data-color-mode={colorScheme}
                        h="100%"
                        style={{ overflowY: 'auto' }}
                    >
                        <MDEditor.Markdown
                            source={form.values.content}
                            style={markdownStyle}
                            components={mdEditorComponents}
                            rehypePlugins={markdownSanitizeRehypePlugins}
                            rehypeRewrite={rehypeRemoveHeaderLinks}
                            remarkPlugins={MARKDOWN_REMARK_PLUGINS}
                        />
                    </Box>
                ) : (
                    <Text
                        component="pre"
                        fz="sm"
                        ff="monospace"
                        style={{
                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'anywhere',
                        }}
                    >
                        {form.values.content}
                    </Text>
                )
            ) : (
                <Stack gap="md" h="100%">
                    <TextInput
                        label="Name"
                        required
                        maxLength={AI_AGENT_DOCUMENT_MAX_NAME_LENGTH}
                        {...form.getInputProps('name')}
                    />
                    {isMarkdown ? (
                        <Box data-color-mode={colorScheme} flex={1} mih={0}>
                            <MDEditor
                                value={form.values.content}
                                onChange={(value) =>
                                    form.setFieldValue('content', value ?? '')
                                }
                                preview="live"
                                previewOptions={{
                                    components: mdEditorComponents,
                                    rehypePlugins:
                                        markdownSanitizeRehypePlugins,
                                    rehypeRewrite: rehypeRemoveHeaderLinks,
                                    remarkPlugins: MARKDOWN_REMARK_PLUGINS,
                                }}
                                height="calc(100dvh - 220px)"
                                overflow={false}
                            />
                        </Box>
                    ) : (
                        <Textarea
                            label="Content"
                            autosize
                            minRows={24}
                            maxRows={40}
                            styles={{ input: { fontFamily: 'monospace' } }}
                            {...form.getInputProps('content')}
                        />
                    )}
                    <Text
                        size="xs"
                        c={contentTooLarge ? 'red' : 'dimmed'}
                        ta="right"
                    >
                        {formatFileSize(contentSizeBytes)} /{' '}
                        {formatFileSize(AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES)}
                    </Text>
                </Stack>
            )}
        </MantineModal>
    );
};

type Props = {
    agentUuid: string;
    document: AiAgentDocumentSummary | null;
    onClose: () => void;
    projectUuid: string;
};

export const AiAgentKnowledgeDocumentModal = ({
    agentUuid,
    document,
    onClose,
    projectUuid,
}: Props) => {
    const documentContent = useAiAgentDocumentContent(
        projectUuid,
        agentUuid,
        document?.uuid ?? null,
    );

    if (!document) return null;

    if (documentContent.data) {
        return (
            <LoadedDocumentModal
                key={document.uuid}
                agentUuid={agentUuid}
                content={documentContent.data.content}
                document={document}
                onClose={onClose}
                projectUuid={projectUuid}
            />
        );
    }

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={document.name}
            fullScreen
            cancelLabel={false}
        >
            <Center h="100%">
                {documentContent.isLoading ? (
                    <Loader />
                ) : (
                    <Stack align="center" gap="xs">
                        <Text size="sm" c="dimmed">
                            Unable to load this document.
                        </Text>
                        <Button
                            size="xs"
                            variant="default"
                            onClick={() => void documentContent.refetch()}
                        >
                            Try again
                        </Button>
                    </Stack>
                )}
            </Center>
        </MantineModal>
    );
};
