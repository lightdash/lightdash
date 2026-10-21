import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Loader,
    Progress,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconArrowRight,
    IconChartBar,
    IconCheck,
    IconFile,
    IconFolder,
    IconLayoutDashboard,
    IconPlayerStop,
    IconRefresh,
    IconUpload,
    IconX,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import Callout from '../../../components/common/Callout';
import FileDropzone from '../../../components/common/FileDropzone/FileDropzone';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import {
    getDuplicateImportIds,
    parseImportFile,
    runContentImport,
    sortImportEntries,
    type ImportEntry,
    type UploadContent,
} from '../importContent';
import classes from './ContentAsCodeUploadModal.module.css';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectName: string;
    onUpload: UploadContent;
    initialEntries?: ImportEntry[];
    warning?: string | null;
};

const typeIcons = {
    space: IconFolder,
    chart: IconChartBar,
    dashboard: IconLayoutDashboard,
};

const statusLabels = {
    ready: 'Ready',
    invalid: 'Invalid file',
    uploading: 'Uploading',
    success: 'Uploaded',
    error: 'Upload failed',
    blocked: 'Blocked',
};

const ContentAsCodeUploadModal: FC<Props> = ({
    opened,
    onClose,
    projectName,
    onUpload,
    initialEntries = [],
    warning = null,
}) => {
    const [entries, setEntries] = useState<ImportEntry[]>(initialEntries);
    const [reading, setReading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [hasRun, setHasRun] = useState(
        initialEntries.some(
            (entry) => entry.status === 'success' || entry.status === 'error',
        ),
    );
    const [stopRequested, setStopRequested] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const busy = useRef(false);
    const stop = useRef(false);
    useEffect(
        () => () => {
            stop.current = true;
        },
        [],
    );
    const duplicates = getDuplicateImportIds(entries);
    const invalidCount = entries.filter(
        (entry) => entry.status === 'invalid' || duplicates.has(entry.id),
    ).length;
    const successCount = entries.filter(
        (entry) => entry.status === 'success',
    ).length;
    const failedCount = entries.filter(
        (entry) => entry.status === 'error',
    ).length;
    const blockedCount = entries.filter(
        (entry) => entry.status === 'blocked',
    ).length;
    const pendingCount = entries.filter(
        (entry) => entry.document && entry.status !== 'success',
    ).length;
    const finishedCount = successCount + failedCount + blockedCount;
    const allSucceeded = entries.length > 0 && successCount === entries.length;
    const sorted = sortImportEntries(entries);

    const addFiles = async (files: File[]) => {
        if (busy.current || files.length === 0) return;
        if (entries.length + files.length > 100) {
            setAddError(
                'Add up to 100 files at a time. Remove some files and try again.',
            );
            return;
        }
        busy.current = true;
        setReading(true);
        setAddError(null);
        const parsed: ImportEntry[] = [];
        for (const file of files) {
            parsed.push(await parseImportFile(file));
        }
        setEntries((current) => [...current, ...parsed]);
        setReading(false);
        busy.current = false;
    };

    const upload = async () => {
        if (busy.current || invalidCount > 0 || pendingCount === 0) return;
        busy.current = true;
        stop.current = false;
        setStopRequested(false);
        setUploading(true);
        setHasRun(true);
        setEntries((current) =>
            current.map((entry) =>
                entry.status === 'success'
                    ? entry
                    : { ...entry, status: 'ready', message: null },
            ),
        );
        try {
            await runContentImport({
                entries,
                upload: onUpload,
                shouldStop: () => stop.current,
                onUpdate: (updated) =>
                    setEntries((current) =>
                        current.map((entry) =>
                            entry.id === updated.id ? updated : entry,
                        ),
                    ),
            });
        } finally {
            setUploading(false);
            busy.current = false;
        }
    };

    const requestClose = () => {
        if (!busy.current) onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={requestClose}
            title="Upload content as code"
            subtitle={
                <>
                    Import into{' '}
                    <Text component="span" fw={500}>
                        {projectName}
                    </Text>
                </>
            }
            icon={IconUpload}
            size="xl"
            bodyScrollAreaMaxHeight="calc(100dvh - 220px)"
            withCloseButton={!uploading && !reading}
            modalRootProps={{
                closeOnClickOutside: false,
                closeOnEscape: !uploading && !reading,
            }}
            cancelLabel={allSucceeded ? false : hasRun ? 'Close' : 'Cancel'}
            cancelDisabled={uploading || reading}
            leftActions={
                <Text size="xs" c="dimmed" role="status">
                    {reading
                        ? 'Reading and validating files…'
                        : uploading
                          ? `${finishedCount} of ${entries.length} processed`
                          : hasRun
                            ? `${successCount} of ${entries.length} files uploaded`
                            : `${entries.length} ${entries.length === 1 ? 'file' : 'files'} selected`}
                </Text>
            }
            actions={
                uploading ? (
                    <Button
                        variant="default"
                        disabled={stopRequested}
                        leftSection={<MantineIcon icon={IconPlayerStop} />}
                        onClick={() => {
                            stop.current = true;
                            setStopRequested(true);
                        }}
                    >
                        {stopRequested
                            ? 'Stopping after current file…'
                            : 'Stop after current file'}
                    </Button>
                ) : allSucceeded ? (
                    <Button onClick={requestClose}>Done</Button>
                ) : (
                    <Button
                        onClick={() => void upload()}
                        disabled={
                            reading || invalidCount > 0 || pendingCount === 0
                        }
                        leftSection={
                            <MantineIcon
                                icon={hasRun ? IconRefresh : IconUpload}
                            />
                        }
                    >
                        {hasRun ? 'Retry' : 'Upload'} {pendingCount || ''}{' '}
                        {pendingCount === 1 ? 'file' : 'files'}
                    </Button>
                )
            }
        >
            <Text size="sm" c="dimmed">
                Add space, chart, and dashboard files. We’ll check them before
                uploading and put them in the right order.
            </Text>

            {!uploading && !allSucceeded && (
                <FileDropzone
                    accept=".yml,.yaml"
                    description="YAML · Up to 5 MB per file · 100 files per upload"
                    disabled={reading}
                    compact={entries.length > 0}
                    onFiles={(files) => void addFiles(files)}
                />
            )}

            {addError && (
                <Callout variant="danger" role="alert">
                    {addError}
                </Callout>
            )}

            {entries.length > 0 && (
                <>
                    <Group justify="space-between" gap="xs">
                        <Group gap="xs">
                            <Text size="sm" fw={500}>
                                Files
                            </Text>
                            <Badge size="sm">{entries.length}</Badge>
                        </Group>
                        {!uploading && !reading && !hasRun && (
                            <Button
                                variant="subtle"
                                size="compact-xs"
                                onClick={() => setEntries([])}
                            >
                                Clear all
                            </Button>
                        )}
                    </Group>

                    <Box
                        className={classes.fileList}
                        component="ul"
                        aria-label="Files to upload"
                    >
                        {sorted.map((entry) => {
                            const duplicate = duplicates.has(entry.id);
                            const error =
                                duplicate ||
                                entry.status === 'invalid' ||
                                entry.status === 'error';
                            const message = duplicate
                                ? `Another file has the same ${entry.document?.type} slug “${entry.document?.content.slug}”. Remove one to continue.`
                                : entry.message;
                            const status = duplicate
                                ? 'Duplicate'
                                : entry.status === 'ready' && uploading
                                  ? 'Queued'
                                  : statusLabels[entry.status];
                            return (
                                <Box
                                    component="li"
                                    key={entry.id}
                                    className={classes.fileRow}
                                >
                                    <Group
                                        align="flex-start"
                                        wrap="nowrap"
                                        gap="sm"
                                    >
                                        <Box className={classes.fileIcon}>
                                            <MantineIcon
                                                icon={
                                                    entry.document
                                                        ? typeIcons[
                                                              entry.document
                                                                  .type
                                                          ]
                                                        : IconFile
                                                }
                                                color="dimmed"
                                            />
                                        </Box>
                                        <Stack gap={4} flex={1} miw={0}>
                                            <Text
                                                size="sm"
                                                fw={500}
                                                className={classes.fileName}
                                            >
                                                {entry.fileName}
                                            </Text>
                                            <Text
                                                size="xs"
                                                c="dimmed"
                                                className={classes.fileName}
                                            >
                                                {entry.document
                                                    ? `${entry.document.type.charAt(0).toUpperCase()}${entry.document.type.slice(1)} · ${entry.document.content.slug}`
                                                    : 'Unrecognized content'}
                                            </Text>
                                            {message && (
                                                <Text
                                                    size="xs"
                                                    c={error ? 'red' : 'dimmed'}
                                                    className={classes.message}
                                                >
                                                    {message}
                                                </Text>
                                            )}
                                            {entry.warnings.map((warning) => (
                                                <Text
                                                    key={warning}
                                                    size="xs"
                                                    c="orange"
                                                >
                                                    {warning}
                                                </Text>
                                            ))}
                                        </Stack>
                                        <Group gap="xs" wrap="nowrap">
                                            {entry.status === 'uploading' ? (
                                                <Loader size="xs" />
                                            ) : entry.status === 'success' ? (
                                                <MantineIcon
                                                    icon={IconCheck}
                                                    color="green"
                                                />
                                            ) : error ? (
                                                <MantineIcon
                                                    icon={IconAlertCircle}
                                                    color="red"
                                                />
                                            ) : null}
                                            <Text
                                                size="xs"
                                                c={
                                                    error
                                                        ? 'red'
                                                        : entry.status ===
                                                            'success'
                                                          ? 'green'
                                                          : 'dimmed'
                                                }
                                            >
                                                {status}
                                            </Text>
                                            {!uploading &&
                                                !reading &&
                                                entry.status !== 'success' && (
                                                    <Tooltip label="Remove file">
                                                        <ActionIcon
                                                            aria-label={`Remove ${entry.fileName}`}
                                                            onClick={() =>
                                                                setEntries(
                                                                    (current) =>
                                                                        current.filter(
                                                                            (
                                                                                file,
                                                                            ) =>
                                                                                file.id !==
                                                                                entry.id,
                                                                        ),
                                                                )
                                                            }
                                                        >
                                                            <MantineIcon
                                                                icon={IconX}
                                                                size="sm"
                                                            />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                )}
                                        </Group>
                                    </Group>
                                </Box>
                            );
                        })}
                    </Box>

                    <Group gap="xs" className={classes.order}>
                        <Text size="xs" c="dimmed">
                            Upload order
                        </Text>
                        <Text size="xs">Spaces</Text>
                        <MantineIcon
                            icon={IconArrowRight}
                            size="xs"
                            color="dimmed"
                        />
                        <Text size="xs">Charts</Text>
                        <MantineIcon
                            icon={IconArrowRight}
                            size="xs"
                            color="dimmed"
                        />
                        <Text size="xs">Dashboards</Text>
                    </Group>
                </>
            )}

            {uploading && (
                <Stack gap="xs" aria-live="polite">
                    <Progress
                        value={
                            entries.length
                                ? (finishedCount / entries.length) * 100
                                : 0
                        }
                        aria-label="Upload progress"
                    />
                    <Text size="xs" c="dimmed">
                        Keep this window open. Files upload one at a time.
                    </Text>
                </Stack>
            )}

            {warning && <Callout variant="warning">{warning}</Callout>}

            <Box aria-live="polite">
                {invalidCount > 0 ? (
                    <Callout
                        variant="danger"
                        title={`${invalidCount} ${invalidCount === 1 ? 'file needs' : 'files need'} attention`}
                    >
                        Fix and re-add these files, or remove them to continue.
                        Nothing new will upload until every file is valid.
                    </Callout>
                ) : allSucceeded ? (
                    <Callout
                        variant="success"
                        title={`${successCount} ${successCount === 1 ? 'file' : 'files'} uploaded`}
                    >
                        Your content is ready in {projectName}.
                    </Callout>
                ) : hasRun && !uploading ? (
                    <Callout
                        variant="warning"
                        title={`${successCount} of ${entries.length} files uploaded`}
                    >
                        {failedCount > 0 && `${failedCount} failed. `}
                        {blockedCount > 0 &&
                            `${blockedCount} blocked by a dependency. `}
                        Successful uploads are kept. Retry sends only unfinished
                        files. A failed request may still have changed content
                        on the server.
                    </Callout>
                ) : entries.length > 0 ? (
                    <Text size="xs" c="dimmed">
                        Matching slugs will update existing content. Uploaded
                        access settings may change who can see it. Permissions
                        and references are checked by the server during upload.
                    </Text>
                ) : null}
            </Box>
        </MantineModal>
    );
};

export default ContentAsCodeUploadModal;
