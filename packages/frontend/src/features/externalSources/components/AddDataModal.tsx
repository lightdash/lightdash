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
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('sync');
    const commitMutation = useCommitCsvUpload(projectUuid);
    const form = useForm({
        initialValues: { tableName: '' },
        validate: {
            tableName: (value) =>
                value.trim().length === 0
                    ? t('externalSources.rename.nameRequired')
                    : null,
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
        <form id="external-source-csv-schema-form" onSubmit={handleSubmit}>
            <Stack gap="md">
                <TextInput
                    label={t('externalSources.add.tableNameLabel')}
                    placeholder="quarterly_targets"
                    description={
                        slug
                            ? t('externalSources.add.willAppearAs', { slug })
                            : t('externalSources.add.tableNameDescription')
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
                        {t('externalSources.preview.columnsTab', {
                            count: columns.length,
                        })}
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
                        {t('externalSources.add.autoMetricsHint')}
                    </Text>
                </Stack>
                <Group justify="space-between">
                    <Button
                        type="button"
                        variant="default"
                        onClick={onBack}
                        disabled={commitMutation.isLoading}
                    >
                        {t('actions.back', { ns: 'common' })}
                    </Button>
                    <Button
                        type="submit"
                        form="external-source-csv-schema-form"
                        loading={commitMutation.isLoading}
                    >
                        {t('externalSources.add.createTable')}
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
    const { t } = useTranslation('sync');
    const createMutation = useCreateSheetsSource(projectUuid);
    const googleLogin = useGoogleLoginPopup('gdrive');
    const form = useForm({
        initialValues: { url: '', tableName: '' },
        validate: {
            url: (value) =>
                parseGoogleSheetsSpreadsheetId(value)
                    ? null
                    : t('externalSources.add.sheetUrlInvalid'),
            tableName: (value) =>
                value.trim().length === 0
                    ? t('externalSources.rename.nameRequired')
                    : null,
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
        <form id="external-source-sheets-form" onSubmit={handleSubmit}>
            <Stack gap="md">
                <TextInput
                    label={t('externalSources.add.sheetUrlLabel')}
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                    leftSection={<MantineIcon icon={IconLink} size="sm" />}
                    data-autofocus
                    {...form.getInputProps('url')}
                />
                <TextInput
                    label={t('externalSources.add.tableNameLabel')}
                    placeholder="quarterly_targets"
                    description={
                        slug
                            ? t('externalSources.add.willAppearAs', { slug })
                            : t('externalSources.add.tableNameDescription')
                    }
                    {...form.getInputProps('tableName')}
                />
                {errorMessage && (
                    <Callout
                        variant="danger"
                        title={t('externalSources.add.sheetConnectFailed')}
                    >
                        <Stack gap="xs" align="flex-start">
                            <Text fz="sm">{errorMessage}</Text>
                            {needsGoogleAuth && (
                                <Button
                                    type="button"
                                    variant="default"
                                    size="compact-sm"
                                    loading={googleLogin.isLoading}
                                    onClick={() => googleLogin.mutate()}
                                >
                                    {t('externalSources.add.connectGoogle')}
                                </Button>
                            )}
                        </Stack>
                    </Callout>
                )}
                <Text fz="xs" c="dimmed">
                    {t('externalSources.add.sheetAuthHint')}
                </Text>
                <Group justify="space-between">
                    <Button
                        type="button"
                        variant="default"
                        onClick={onBack}
                        disabled={createMutation.isLoading}
                    >
                        {t('actions.back', { ns: 'common' })}
                    </Button>
                    <Button
                        type="submit"
                        form="external-source-sheets-form"
                        loading={createMutation.isLoading}
                    >
                        {t('externalSources.add.connectSheet')}
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
    const { t } = useTranslation('sync');
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
                <Callout
                    variant="danger"
                    title={t('externalSources.importFailedTitle')}
                >
                    {source.errorMessage ??
                        t('externalSources.add.preparingError')}
                </Callout>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onRetry}>
                        {t('externalSources.tryAnotherFile')}
                    </Button>
                </Group>
            </Stack>
        );
    }

    return (
        <Stack gap="xs" align="center" py="lg">
            <Loader size="sm" />
            <Text fz="sm" fw={500}>
                {t('externalSources.add.preparing')}
            </Text>
            <Text fz="xs" c="dimmed">
                {t('externalSources.add.preparingHint')}
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
    const { t } = useTranslation('sync');
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
            title={
                isSheetsMode
                    ? t('externalSources.add.sheetsTitle')
                    : t('externalSources.add.csvTitle')
            }
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
                                {t('externalSources.add.switchToSheets')}
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
                                title: t('externalSources.toasts.created'),
                                subtitle: t(
                                    'externalSources.toasts.createdSubtitle',
                                ),
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
