import {
    ExternalSourceStatus,
    parseGoogleSheetsSpreadsheetId,
    snakeCaseName,
    type StagedExternalSourceUpload,
} from '@lightdash/common';
import {
    Button,
    Group,
    Loader,
    Stack,
    Table,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconBrandGoogleDrive,
    IconFileSpreadsheet,
    IconLink,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useGoogleLoginPopup } from '../../../hooks/gdrive/useGdrive';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useCommitCsvUpload,
    useCreateSheetsSource,
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

type SheetsStepProps = {
    projectUuid: string;
    onBack: () => void;
    onCreated: (sourceUuid: string) => void;
};

const SheetsStep: FC<SheetsStepProps> = ({
    projectUuid,
    onBack,
    onCreated,
}) => {
    const createMutation = useCreateSheetsSource(projectUuid);
    const googleLogin = useGoogleLoginPopup('gdrive');
    const form = useForm({
        initialValues: { url: '', tableName: '' },
        validate: {
            url: (value) =>
                parseGoogleSheetsSpreadsheetId(value)
                    ? null
                    : 'Paste the sheet URL from your browser',
            tableName: (value) =>
                value.trim().length === 0 ? 'Give the table a name' : null,
        },
    });
    const slug = snakeCaseName(form.values.tableName || '');
    const errorMessage = createMutation.isError
        ? createMutation.error.error.message
        : undefined;
    const needsGoogleAuth = errorMessage
        ?.toLowerCase()
        .includes('google account');

    const handleSubmit = form.onSubmit((values) => {
        createMutation.mutate(
            { url: values.url.trim(), tableName: values.tableName.trim() },
            { onSuccess: (source) => onCreated(source.sourceUuid) },
        );
    });

    return (
        <form onSubmit={handleSubmit}>
            <Stack gap="md">
                <TextInput
                    label="Google Sheets URL"
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                    leftSection={<MantineIcon icon={IconLink} size="sm" />}
                    data-autofocus
                    {...form.getInputProps('url')}
                />
                <TextInput
                    label="Table name"
                    placeholder="quarterly_targets"
                    description={
                        slug
                            ? `Will appear as ${slug}`
                            : 'How this table will appear in the sidebar'
                    }
                    {...form.getInputProps('tableName')}
                />
                {errorMessage && (
                    <Callout
                        variant="danger"
                        title="Couldn't connect the sheet"
                    >
                        <Stack gap="xs" align="flex-start">
                            <Text fz="sm">{errorMessage}</Text>
                            {needsGoogleAuth && (
                                <Button
                                    variant="default"
                                    size="compact-sm"
                                    loading={googleLogin.isLoading}
                                    onClick={() => googleLogin.mutate()}
                                >
                                    Connect Google account
                                </Button>
                            )}
                        </Stack>
                    </Callout>
                )}
                <Text fz="xs" c="dimmed">
                    Reads the sheet with your Google account. Refresh the table
                    any time from its menu.
                </Text>
                <Group justify="space-between">
                    <Button
                        variant="default"
                        onClick={onBack}
                        disabled={createMutation.isLoading}
                    >
                        Back
                    </Button>
                    <Button type="submit" loading={createMutation.isLoading}>
                        Connect sheet
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
    /** Overrides the default navigate-into-the-explore behavior on create. */
    onCreated?: (exploreName: string) => void;
};

export const AddDataModal: FC<AddDataModalProps> = ({
    projectUuid,
    opened,
    onClose,
    onCreated,
}) => {
    const navigate = useNavigate();
    const { showToastSuccess } = useToaster();
    const uploadMutation = useUploadCsv(projectUuid);
    const [committedSourceUuid, setCommittedSourceUuid] = useState<string>();
    const [mode, setMode] = useState<'csv' | 'sheets'>('csv');
    const invalidateTables = useInvalidateTables();

    const handleClose = () => {
        uploadMutation.reset();
        setCommittedSourceUuid(undefined);
        setMode('csv');
        onClose();
    };

    const stage = uploadMutation.data;
    const isSheetsMode = mode === 'sheets' && !stage && !committedSourceUuid;

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title={isSheetsMode ? 'Connect a Google Sheet' : 'Upload a CSV'}
            icon={isSheetsMode ? IconBrandGoogleDrive : IconFileSpreadsheet}
            size="lg"
        >
            <Stack gap="md">
                {!stage && !committedSourceUuid && mode === 'csv' && (
                    <>
                        <CsvDropzone
                            isUploading={uploadMutation.isLoading}
                            onFile={(file) => uploadMutation.mutate(file)}
                        />
                        <Group justify="center">
                            <Button
                                variant="subtle"
                                size="compact-xs"
                                leftSection={
                                    <MantineIcon
                                        icon={IconBrandGoogleDrive}
                                        size="sm"
                                    />
                                }
                                onClick={() => setMode('sheets')}
                            >
                                Connect a Google Sheet instead
                            </Button>
                        </Group>
                    </>
                )}
                {isSheetsMode && (
                    <SheetsStep
                        projectUuid={projectUuid}
                        onBack={() => setMode('csv')}
                        onCreated={(sourceUuid) => {
                            setCommittedSourceUuid(sourceUuid);
                            setMode('csv');
                        }}
                    />
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
                            if (onCreated) {
                                onCreated(exploreName);
                            } else {
                                void navigate(
                                    `/projects/${projectUuid}/tables/${exploreName}`,
                                );
                            }
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
