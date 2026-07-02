import { type AiAgentDocumentSummary } from '@lightdash/common';
import {
    Button,
    Center,
    Group,
    Loader,
    Stack,
    TextInput,
    useMantineColorScheme,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconDownload } from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { useCallback } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import {
    useAiAgentDocumentContent,
    useUpdateAiAgentDocument,
} from '../hooks/useAiAgentDocuments';

type EditorProps = {
    document: AiAgentDocumentSummary;
    content: string;
    onClose: () => void;
};

const DocumentEditor = ({ document, content, onClose }: EditorProps) => {
    const { colorScheme } = useMantineColorScheme();
    const updateDocument = useUpdateAiAgentDocument();
    const form = useForm({
        initialValues: { name: document.name, content },
    });

    const hasChanges =
        form.values.name.trim() !== document.name ||
        form.values.content !== content;

    const handleDownload = useCallback(() => {
        const blob = new Blob([form.values.content], {
            type: `${document.mimeType};charset=utf-8`,
        });
        const url = URL.createObjectURL(blob);
        const anchor = window.document.createElement('a');
        anchor.href = url;
        anchor.download = document.originalFilename;
        anchor.click();
        URL.revokeObjectURL(url);
    }, [document.mimeType, document.originalFilename, form.values.content]);

    const handleSave = useCallback(() => {
        updateDocument.mutate(
            {
                documentUuid: document.uuid,
                data: {
                    name: form.values.name.trim(),
                    content: form.values.content,
                },
            },
            { onSuccess: () => onClose() },
        );
    }, [document.uuid, form.values, onClose, updateDocument]);

    return (
        <Stack gap="md">
            <TextInput
                label="Name"
                value={form.values.name}
                onChange={(e) =>
                    form.setFieldValue('name', e.currentTarget.value)
                }
            />
            <div data-color-mode={colorScheme}>
                <MDEditor
                    value={form.values.content}
                    onChange={(value) =>
                        form.setFieldValue('content', value ?? '')
                    }
                    preview="live"
                    height={420}
                    overflow={false}
                />
            </div>
            <Group justify="space-between">
                <Button
                    variant="default"
                    leftSection={<MantineIcon icon={IconDownload} />}
                    onClick={handleDownload}
                >
                    Download
                </Button>
                <Group gap="xs">
                    <Button variant="subtle" color="gray" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!hasChanges || form.values.name.trim() === ''}
                        loading={updateDocument.isLoading}
                    >
                        Save
                    </Button>
                </Group>
            </Group>
        </Stack>
    );
};

type Props = {
    document: AiAgentDocumentSummary | null;
    onClose: () => void;
};

export const AiAgentKnowledgeDocumentModal = ({ document, onClose }: Props) => {
    const { data, isLoading } = useAiAgentDocumentContent(
        document?.uuid ?? null,
    );

    if (!document) return null;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={document.name}
            size="xl"
            cancelLabel={false}
        >
            {isLoading || !data ? (
                <Center h={480}>
                    <Loader />
                </Center>
            ) : (
                <DocumentEditor
                    key={document.uuid}
                    document={document}
                    content={data.content}
                    onClose={onClose}
                />
            )}
        </MantineModal>
    );
};
