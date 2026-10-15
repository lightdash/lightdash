import {
    checkThemeLimits,
    getThemeTotalBytes,
    MAX_THEME_TOTAL_BYTES,
    type ApiOrganizationDesign,
    type ApiOrganizationDesignFile,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Center,
    Divider,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
    Textarea,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconCheck, IconDownload, IconTrash } from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import {
    useClearDefaultOrganizationDesign,
    useDeleteAllDesignFiles,
    useDeleteDesignFile,
    useOrganizationDesign,
    useSetDefaultOrganizationDesign,
    useUpdateOrganizationDesign,
} from '../hooks/useOrganizationDesigns';
import { DesignFileUpload } from './DesignFileUpload';

const AUTOSAVE_DELAY_MS = 3000;

type Props = {
    designUuid: string;
};

const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const KIND_COLORS: Record<string, string> = {
    css: 'blue',
    font: 'grape',
    image: 'teal',
    instruction: 'orange',
};

const FileRow: FC<{
    designUuid: string;
    file: ApiOrganizationDesignFile;
    onDelete: () => void;
    deleting: boolean;
}> = ({ designUuid, file, onDelete, deleting }) => {
    const { t } = useTranslation('settings');
    const downloadUrl = `/api/v1/org/designs/${designUuid}/files/${file.fileUuid}`;
    return (
        <Group justify="space-between" wrap="nowrap" gap="sm">
            <Group gap="xs" wrap="nowrap" flex={1} miw={0}>
                <Badge
                    color={KIND_COLORS[file.kind] ?? 'gray'}
                    size="sm"
                    flex="0 0 auto"
                >
                    {file.kind}
                </Badge>
                <Text size="sm" truncate>
                    {file.filename}
                </Text>
                <Text size="xs" c="dimmed" flex="0 0 auto">
                    {formatBytes(file.sizeBytes)}
                </Text>
            </Group>
            <Group gap={4} wrap="nowrap">
                <Tooltip label={t('designs.detail.download')} position="top">
                    <ActionIcon
                        component="a"
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('designs.detail.downloadFile', {
                            filename: file.filename,
                        })}
                    >
                        <MantineIcon icon={IconDownload} />
                    </ActionIcon>
                </Tooltip>
                <Tooltip label={t('designs.detail.delete')} position="top">
                    <ActionIcon
                        color="red"
                        onClick={onDelete}
                        loading={deleting}
                        aria-label={t('designs.detail.deleteFile', {
                            filename: file.filename,
                        })}
                    >
                        <MantineIcon icon={IconTrash} />
                    </ActionIcon>
                </Tooltip>
            </Group>
        </Group>
    );
};

// Inner form component keyed by designUuid so it remounts (and re-initialises
// the form from server state) only when the user switches to a different
// theme — not on every refetch triggered by file uploads or default toggles.
const DesignForm: FC<{ design: ApiOrganizationDesign }> = ({ design }) => {
    const { t } = useTranslation('settings');
    const updateDesign = useUpdateOrganizationDesign();
    const setDefault = useSetDefaultOrganizationDesign();
    const clearDefault = useClearDefaultOrganizationDesign();
    const deleteFile = useDeleteDesignFile();
    const deleteAllFiles = useDeleteAllDesignFiles();

    const form = useForm({
        initialValues: {
            name: design.name,
            description: design.description ?? '',
            extraInstructions: design.extraInstructions ?? '',
        },
    });
    const [pendingDeleteUuid, setPendingDeleteUuid] = useState<string | null>(
        null,
    );
    const [clearFilesOpen, setClearFilesOpen] = useState(false);

    // Theme size guardrail: files are streamed into the sandbox on each build,
    // so an oversized theme times out when applied. Surface the budget as it fills.
    const totalBytes = getThemeTotalBytes(design.files);
    const limitViolation = checkThemeLimits(design.files);
    const nearLimit = totalBytes >= MAX_THEME_TOTAL_BYTES * 0.8;

    const trimmedName = form.values.name.trim();
    const trimmedDescription = form.values.description.trim();
    const trimmedExtraInstructions = form.values.extraInstructions.trim();
    const hasUnsavedChanges =
        trimmedName !== design.name ||
        trimmedDescription !== (design.description ?? '') ||
        trimmedExtraInstructions !== (design.extraInstructions ?? '');
    const canSave = hasUnsavedChanges && trimmedName.length > 0;

    const updateMutate = updateDesign.mutate;
    const designUuid = design.designUuid;

    // Auto-save: fire after the user stops typing.
    useEffect(() => {
        if (!canSave) return;
        const timer = setTimeout(() => {
            updateMutate({
                designUuid,
                data: {
                    name: trimmedName,
                    description: trimmedDescription || null,
                    extraInstructions: trimmedExtraInstructions || null,
                },
            });
        }, AUTOSAVE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [
        canSave,
        designUuid,
        trimmedName,
        trimmedDescription,
        trimmedExtraInstructions,
        updateMutate,
    ]);

    // Latest values held in a ref so the unmount cleanup can flush the most
    // recent edits even if the debounce hasn't fired yet.
    const latestRef = useRef({
        design,
        trimmedName,
        trimmedDescription,
        trimmedExtraInstructions,
        mutate: updateMutate,
    });
    latestRef.current = {
        design,
        trimmedName,
        trimmedDescription,
        trimmedExtraInstructions,
        mutate: updateMutate,
    };

    // Flush pending edits on unmount (e.g. when the user clicks Done before
    // the debounce fires).
    useEffect(() => {
        return () => {
            const {
                design: d,
                trimmedName: n,
                trimmedDescription: dsc,
                trimmedExtraInstructions: ex,
                mutate,
            } = latestRef.current;
            if (!n) return;
            if (
                n === d.name &&
                dsc === (d.description ?? '') &&
                ex === (d.extraInstructions ?? '')
            )
                return;
            mutate({
                designUuid: d.designUuid,
                data: {
                    name: n,
                    description: dsc || null,
                    extraInstructions: ex || null,
                },
            });
        };
    }, []);

    const renderSaveStatus = () => {
        if (updateDesign.isLoading) {
            return (
                <>
                    <Loader size={12} />
                    <Text size="xs" c="dimmed">
                        {t('designs.detail.saving')}
                    </Text>
                </>
            );
        }
        if (hasUnsavedChanges) {
            return (
                <Text size="xs" c="dimmed">
                    {t('designs.detail.unsavedChanges')}
                </Text>
            );
        }
        if (updateDesign.isSuccess) {
            return (
                <>
                    <MantineIcon icon={IconCheck} size={14} color="green.6" />
                    <Text size="xs" c="dimmed">
                        {t('designs.detail.saved')}
                    </Text>
                </>
            );
        }
        return null;
    };

    return (
        <Group align="stretch" gap="lg" wrap="nowrap">
            {/* Left column: metadata + actions */}
            <Stack gap="md" flex={1}>
                <Group justify="space-between" align="center">
                    <Title order={6}>{t('designs.detail.details')}</Title>
                    <Group gap="xxs" align="center" h={16}>
                        {renderSaveStatus()}
                    </Group>
                </Group>
                <TextInput
                    label={t('designs.detail.nameLabel')}
                    required
                    {...form.getInputProps('name')}
                />
                <Textarea
                    label={t('designs.detail.descriptionLabel')}
                    minRows={3}
                    autosize
                    description={t('designs.detail.descriptionHelp')}
                    {...form.getInputProps('description')}
                />
                <Textarea
                    label={t('designs.detail.extraInstructionsLabel')}
                    description={t('designs.detail.extraInstructionsHelp')}
                    placeholder={t(
                        'designs.detail.extraInstructionsPlaceholder',
                    )}
                    minRows={4}
                    autosize
                    {...form.getInputProps('extraInstructions')}
                />

                <Divider />

                <Box>
                    <Title order={6}>{t('designs.detail.defaultTitle')}</Title>
                    <Text size="sm" c="dimmed" mt={4}>
                        {t('designs.detail.defaultDescription')}
                    </Text>
                </Box>
                <Switch
                    label={t('designs.detail.useAsDefault')}
                    checked={design.isDefault}
                    disabled={setDefault.isLoading || clearDefault.isLoading}
                    onChange={(e) => {
                        if (e.currentTarget.checked && !design.isDefault) {
                            setDefault.mutate(design.designUuid);
                        } else if (
                            !e.currentTarget.checked &&
                            design.isDefault
                        ) {
                            clearDefault.mutate();
                        }
                    }}
                />
            </Stack>

            <Divider orientation="vertical" />

            {/* Right column: files */}
            <Stack gap="md" flex={1}>
                <Box>
                    <Group justify="space-between" align="baseline">
                        <Title order={6}>
                            {t('designs.detail.filesTitle')}
                        </Title>
                        <Group gap="xs" align="baseline">
                            <Text
                                size="xs"
                                c={limitViolation ? 'red.6' : 'ldGray.6'}
                            >
                                {t('designs.detail.filesUsage', {
                                    count: design.files.length,
                                    used: formatBytes(totalBytes),
                                    max: formatBytes(MAX_THEME_TOTAL_BYTES),
                                })}
                            </Text>
                            {design.files.length > 0 && (
                                <Button
                                    variant="subtle"
                                    color="red"
                                    size="compact-xs"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconTrash}
                                            size={12}
                                        />
                                    }
                                    onClick={() => setClearFilesOpen(true)}
                                >
                                    {t('designs.detail.deleteAll')}
                                </Button>
                            )}
                        </Group>
                    </Group>
                    <Text size="sm" c="dimmed" mt={4}>
                        {t('designs.detail.filesHelp')}
                    </Text>
                </Box>

                {(limitViolation || nearLimit) && (
                    <Callout variant="warning">
                        {t(
                            limitViolation
                                ? 'designs.detail.overLimit'
                                : 'designs.detail.nearLimit',
                            {
                                used: formatBytes(totalBytes),
                                max: formatBytes(MAX_THEME_TOTAL_BYTES),
                            },
                        )}
                    </Callout>
                )}

                <DesignFileUpload
                    designUuid={design.designUuid}
                    themeName={design.name}
                    existingFiles={design.files}
                />

                {design.files.length === 0 ? (
                    <Text size="sm" c="dimmed" ta="center" py="md">
                        {t('designs.detail.noFiles')}
                    </Text>
                ) : (
                    <Stack gap="xs">
                        {design.files.map((file) => (
                            <FileRow
                                key={file.fileUuid}
                                designUuid={design.designUuid}
                                file={file}
                                onDelete={() => {
                                    setPendingDeleteUuid(file.fileUuid);
                                    deleteFile.mutate(
                                        {
                                            designUuid: design.designUuid,
                                            fileUuid: file.fileUuid,
                                        },
                                        {
                                            onSettled: () =>
                                                setPendingDeleteUuid(null),
                                        },
                                    );
                                }}
                                deleting={
                                    pendingDeleteUuid === file.fileUuid &&
                                    deleteFile.isLoading
                                }
                            />
                        ))}
                    </Stack>
                )}
            </Stack>

            <MantineModal
                opened={clearFilesOpen}
                onClose={() => setClearFilesOpen(false)}
                variant="delete"
                title={t('designs.detail.deleteAllTitle')}
                description={t('designs.detail.deleteAllDescription', {
                    count: design.files.length,
                    name: design.name,
                })}
                size="md"
                confirmLoading={deleteAllFiles.isLoading}
                onConfirm={() =>
                    deleteAllFiles.mutate(design.designUuid, {
                        onSuccess: () => setClearFilesOpen(false),
                    })
                }
            >
                <span>{t('designs.detail.deleteAllBody')}</span>
            </MantineModal>
        </Group>
    );
};

export const DesignDetailPanel: FC<Props> = ({ designUuid }) => {
    const { t } = useTranslation('settings');
    const { data: design, isInitialLoading } =
        useOrganizationDesign(designUuid);

    if (isInitialLoading) {
        return (
            <Center p="lg">
                <Loader size="sm" />
            </Center>
        );
    }

    if (!design) {
        return <Text c="dimmed">{t('designs.detail.notFound')}</Text>;
    }

    return <DesignForm key={design.designUuid} design={design} />;
};
