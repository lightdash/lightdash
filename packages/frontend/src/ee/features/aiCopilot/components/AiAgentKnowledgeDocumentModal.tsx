import {
    AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES,
    type AiAgentDocumentContent,
} from '@lightdash/common';
import {
    Button,
    Center,
    Loader,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconDownload } from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { useCallback, useMemo } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import { formatFileSize } from '../../../../utils/formatters';
import {
    useAiAgentDocumentContent,
    useUpdateAiAgentDocument,
} from '../hooks/useAiAgentDocuments';

const byteLength = (value: string): number =>
    new TextEncoder().encode(value).length;

const downloadDocument = (document: AiAgentDocumentContent) => {
    const extension = document.mimeType === 'text/markdown' ? '.md' : '.txt';
    const blob = new Blob([document.content], {
        type: `${document.mimeType};charset=utf-8`,
    });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${document.name}${extension}`;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

type BodyProps = {
    document: AiAgentDocumentContent;
    canManage: boolean;
    onClose: () => void;
};

const AiAgentKnowledgeDocumentModalBody = ({
    document,
    canManage,
    onClose,
}: BodyProps) => {
    const updateDocument = useUpdateAiAgentDocument();

    const form = useForm({
        initialValues: {
            name: document.name,
            content: document.content,
        },
    });

    const contentBytes = useMemo(
        () => byteLength(form.values.content),
        [form.values.content],
    );
    const exceedsLimit = contentBytes > AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES;
    const hasChanges =
        form.values.name.trim() !== document.name ||
        form.values.content !== document.content;

    const handleSave = useCallback(async () => {
        const nextName = form.values.name.trim();
        // Only send content when it changed — a rename shouldn't trigger a
        // summary regeneration on the backend.
        await updateDocument.mutateAsync({
            documentUuid: document.uuid,
            data: {
                ...(nextName !== document.name ? { name: nextName } : {}),
                ...(form.values.content !== document.content
                    ? { content: form.values.content }
                    : {}),
            },
        });
        onClose();
    }, [
        document.uuid,
        document.name,
        document.content,
        form.values,
        onClose,
        updateDocument,
    ]);

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={document.name}
            size="xl"
            confirmBeforeClose={hasChanges}
            headerActions={
                <Button
                    variant="subtle"
                    size="compact-sm"
                    leftSection={<MantineIcon icon={IconDownload} />}
                    onClick={() => downloadDocument(document)}
                >
                    Download
                </Button>
            }
            onConfirm={canManage ? () => void handleSave() : undefined}
            confirmLabel="Save"
            confirmLoading={updateDocument.isLoading}
            confirmDisabled={
                !hasChanges ||
                exceedsLimit ||
                form.values.name.trim().length === 0
            }
            cancelLabel={canManage ? 'Cancel' : 'Close'}
        >
            <Stack gap="sm">
                {canManage && (
                    <TextInput label="Name" {...form.getInputProps('name')} />
                )}
                <div data-color-mode="light">
                    <MDEditor
                        preview={canManage ? 'edit' : 'preview'}
                        hideToolbar={!canManage}
                        height={480}
                        overflow={false}
                        value={form.values.content}
                        onChange={(value) =>
                            form.setFieldValue('content', value ?? '')
                        }
                    />
                </div>
                <Text size="xs" c={exceedsLimit ? 'red' : 'dimmed'} ta="right">
                    {formatFileSize(contentBytes)} /{' '}
                    {formatFileSize(AI_AGENT_DOCUMENT_MAX_CONTENT_BYTES)}
                </Text>
            </Stack>
        </MantineModal>
    );
};

type Props = {
    documentUuid: string;
    documentName: string;
    canManage: boolean;
    onClose: () => void;
};

export const AiAgentKnowledgeDocumentModal = ({
    documentUuid,
    documentName,
    canManage,
    onClose,
}: Props) => {
    const { data, isLoading } = useAiAgentDocumentContent(documentUuid);

    if (isLoading || !data) {
        return (
            <MantineModal
                opened
                onClose={onClose}
                title={documentName}
                size="xl"
                cancelLabel={false}
            >
                <Center h={480}>
                    <Loader />
                </Center>
            </MantineModal>
        );
    }

    return (
        <AiAgentKnowledgeDocumentModalBody
            key={documentUuid}
            document={data}
            canManage={canManage}
            onClose={onClose}
        />
    );
};
