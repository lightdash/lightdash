import {
    ExternalSourceStatus,
    snakeCaseName,
    type StagedExternalSourceUpload,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    Loader,
    Stack,
    Table,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconFileSpreadsheet } from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import Callout from '../../../components/common/Callout';
import MantineModal from '../../../components/common/MantineModal';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useCommitCsvUpload,
    useExternalSource,
    useInvalidateTables,
    useUploadCsv,
} from '../hooks/useExternalSources';
import { CsvDropzone } from './CsvDropzone';

type SchemaPreviewStepProps = {
    projectUuid: string;
    stage: StagedExternalSourceUpload;
    onBack: () => void;
    onCommitted: (sourceUuid: string) => void;
};

const SchemaPreviewStep: FC<SchemaPreviewStepProps> = ({
    projectUuid,
    stage,
    onBack,
    onCommitted,
}) => {
    const commitMutation = useCommitCsvUpload(projectUuid);
    const form = useForm({
        initialValues: { tableName: '' },
        validate: {
            tableName: (value) =>
                value.trim().length === 0 ? 'Give the table a name' : null,
        },
    });
    const columns = Object.values(stage.inferredColumns);
    const slug = snakeCaseName(form.values.tableName || '');

    const handleSubmit = form.onSubmit((values) => {
        commitMutation.mutate(
            {
                sourceUuid: stage.sourceUuid,
                payload: { tableName: values.tableName.trim() },
            },
            {
                onSuccess: (source) => onCommitted(source.sourceUuid),
            },
        );
    });

    return (
        <form onSubmit={handleSubmit}>
            <Stack gap="md">
                <TextInput
                    label="Table name"
                    placeholder="quarterly_targets"
                    description={
                        slug
                            ? `Will appear as ${slug}`
                            : 'How this table will appear in the sidebar'
                    }
                    data-autofocus
                    {...form.getInputProps('tableName')}
                    error={
                        form.errors.tableName ??
                        (commitMutation.isError
                            ? commitMutation.error.error.message
                            : undefined)
                    }
                />
                <Stack gap="xs">
                    <Text fz="sm" fw={500}>
                        Columns · {columns.length}
                    </Text>
                    <Table verticalSpacing={6} horizontalSpacing="sm">
                        <Table.Tbody>
                            {columns.map((column) => (
                                <Table.Tr key={column.reference}>
                                    <Table.Td>
                                        <Text fz="xs" fw={500}>
                                            {column.reference}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td w={110}>
                                        <Text fz="xs" c="dimmed">
                                            {column.type}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                    <Text fz="xs" c="dimmed">
                        Row count, plus sum and average metrics for numeric
                        columns, are added automatically.
                    </Text>
                </Stack>
                <Group justify="space-between">
                    <Button
                        variant="default"
                        onClick={onBack}
                        disabled={commitMutation.isLoading}
                    >
                        Back
                    </Button>
                    <Button type="submit" loading={commitMutation.isLoading}>
                        Create table
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

type PreparingStepProps = {
    projectUuid: string;
    sourceUuid: string;
    onReady: (exploreName: string) => void;
    onRetry: () => void;
};

const PreparingStep: FC<PreparingStepProps> = ({
    projectUuid,
    sourceUuid,
    onReady,
    onRetry,
}) => {
    const { data: source } = useExternalSource(projectUuid, sourceUuid, {
        poll: true,
    });
    const settledRef = useRef(false);

    // Reacting to a server-state transition (ingest finished) with a
    // navigation side effect — a legitimate external-system sync.
    useEffect(() => {
        if (settledRef.current) return;
        if (source?.status === ExternalSourceStatus.READY && source.tables[0]) {
            settledRef.current = true;
            onReady(source.tables[0].name);
        }
    }, [source, onReady]);

    if (source?.status === ExternalSourceStatus.ERROR) {
        return (
            <Stack gap="md">
                <Callout variant="danger" title="We couldn't import this file">
                    {source.errorMessage ??
                        'Something went wrong while preparing the table.'}
                </Callout>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onRetry}>
                        Try another file
                    </Button>
                </Group>
            </Stack>
        );
    }

    return (
        <Stack gap="xs" align="center" py="lg">
            <Loader size="sm" />
            <Text fz="sm" fw={500}>
                Preparing your table…
            </Text>
            <Text fz="xs" c="dimmed">
                You'll land in the new table as soon as it's ready.
            </Text>
        </Stack>
    );
};

type AddDataModalProps = {
    projectUuid: string;
    opened: boolean;
    onClose: () => void;
};

export const AddDataModal: FC<AddDataModalProps> = ({
    projectUuid,
    opened,
    onClose,
}) => {
    const navigate = useNavigate();
    const { showToastSuccess } = useToaster();
    const uploadMutation = useUploadCsv(projectUuid);
    const [committedSourceUuid, setCommittedSourceUuid] = useState<string>();
    const invalidateTables = useInvalidateTables();

    const handleClose = () => {
        uploadMutation.reset();
        setCommittedSourceUuid(undefined);
        onClose();
    };

    const stage = uploadMutation.data;

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title="Upload a CSV"
            icon={IconFileSpreadsheet}
            size="lg"
        >
            <Stack gap="md">
                {!stage && !committedSourceUuid && (
                    <>
                        <CsvDropzone
                            isUploading={uploadMutation.isLoading}
                            onFile={(file) => uploadMutation.mutate(file)}
                        />
                        <Group gap="xs" justify="center">
                            <Badge variant="light" color="gray" size="xs">
                                Coming soon
                            </Badge>
                            <Text fz="xs" c="dimmed">
                                Google Sheets and other sources
                            </Text>
                        </Group>
                    </>
                )}
                {stage && !committedSourceUuid && (
                    <SchemaPreviewStep
                        key={stage.sourceUuid}
                        projectUuid={projectUuid}
                        stage={stage}
                        onBack={() => uploadMutation.reset()}
                        onCommitted={(sourceUuid) => {
                            setCommittedSourceUuid(sourceUuid);
                            uploadMutation.reset();
                        }}
                    />
                )}
                {committedSourceUuid && (
                    <PreparingStep
                        projectUuid={projectUuid}
                        sourceUuid={committedSourceUuid}
                        onReady={(exploreName) => {
                            void invalidateTables(projectUuid);
                            showToastSuccess({
                                title: 'Table created',
                                subtitle:
                                    'Pick fields to build your first chart.',
                            });
                            handleClose();
                            void navigate(
                                `/projects/${projectUuid}/tables/${exploreName}`,
                            );
                        }}
                        onRetry={() => {
                            setCommittedSourceUuid(undefined);
                            uploadMutation.reset();
                        }}
                    />
                )}
            </Stack>
        </MantineModal>
    );
};
