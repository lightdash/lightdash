import {
    type ApiOrganizationDesign,
    type ApiOrganizationDesignFile,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
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
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconCheck, IconDownload, IconTrash } from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    useClearDefaultOrganizationDesign,
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
    const downloadUrl = `/api/v1/org/designs/${designUuid}/files/${file.fileUuid}`;
    return (
        <Group justify="space-between" wrap="nowrap" gap="sm">
            <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                <Badge
                    color={KIND_COLORS[file.kind] ?? 'gray'}
                    variant="light"
                    size="sm"
                    style={{ flexShrink: 0 }}
                >
                    {file.kind}
                </Badge>
                <Text size="sm" truncate>
                    {file.filename}
                </Text>
                <Text size="xs" c="ldGray.6" style={{ flexShrink: 0 }}>
                    {formatBytes(file.sizeBytes)}
                </Text>
            </Group>
            <Group gap={4} wrap="nowrap">
                <Tooltip label="Download" position="top">
                    <ActionIcon
                        component="a"
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="subtle"
                        color="gray"
                        aria-label={`Download ${file.filename}`}
                    >
                        <MantineIcon icon={IconDownload} />
                    </ActionIcon>
                </Tooltip>
                <Tooltip label="Delete" position="top">
                    <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={onDelete}
                        loading={deleting}
                        aria-label={`Delete ${file.filename}`}
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
    const updateDesign = useUpdateOrganizationDesign();
    const setDefault = useSetDefaultOrganizationDesign();
    const clearDefault = useClearDefaultOrganizationDesign();
    const deleteFile = useDeleteDesignFile();

    const form = useForm({
        initialValues: {
            name: design.name,
            description: design.description ?? '',
        },
    });
    const [pendingDeleteUuid, setPendingDeleteUuid] = useState<string | null>(
        null,
    );

    const trimmedName = form.values.name.trim();
    const trimmedDescription = form.values.description.trim();
    const hasUnsavedChanges =
        trimmedName !== design.name ||
        trimmedDescription !== (design.description ?? '');
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
                },
            });
        }, AUTOSAVE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [canSave, designUuid, trimmedName, trimmedDescription, updateMutate]);

    // Latest values held in a ref so the unmount cleanup can flush the most
    // recent edits even if the debounce hasn't fired yet.
    const latestRef = useRef({
        design,
        trimmedName,
        trimmedDescription,
        mutate: updateMutate,
    });
    latestRef.current = {
        design,
        trimmedName,
        trimmedDescription,
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
                mutate,
            } = latestRef.current;
            if (!n) return;
            if (n === d.name && dsc === (d.description ?? '')) return;
            mutate({
                designUuid: d.designUuid,
                data: { name: n, description: dsc || null },
            });
        };
    }, []);

    const renderSaveStatus = () => {
        if (updateDesign.isLoading) {
            return (
                <>
                    <Loader size={12} />
                    <Text size="xs" c="ldGray.6">
                        Saving…
                    </Text>
                </>
            );
        }
        if (hasUnsavedChanges) {
            return (
                <Text size="xs" c="ldGray.6">
                    Unsaved changes
                </Text>
            );
        }
        if (updateDesign.isSuccess) {
            return (
                <>
                    <MantineIcon icon={IconCheck} size={14} color="green.6" />
                    <Text size="xs" c="ldGray.6">
                        Saved
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
                    <Title order={6}>Details</Title>
                    <Group gap="xxs" align="center" h={16}>
                        {renderSaveStatus()}
                    </Group>
                </Group>
                <TextInput
                    label="Name"
                    required
                    {...form.getInputProps('name')}
                />
                <Textarea
                    label="Description"
                    minRows={3}
                    autosize
                    {...form.getInputProps('description')}
                />

                <Divider />

                <Box>
                    <Title order={6}>Default</Title>
                    <Text size="sm" c="ldGray.6" mt={4}>
                        The default theme is automatically applied to new
                        content. Individual items can override it.
                    </Text>
                </Box>
                <Switch
                    label="Use as default theme"
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
                    <Title order={6}>Files</Title>
                    <Text size="sm" c="ldGray.6" mt={4}>
                        Drag &amp; drop CSS, font, image, or markdown
                        instruction files. They&apos;ll be picked up
                        automatically wherever this theme is applied.
                    </Text>
                </Box>

                <DesignFileUpload designUuid={design.designUuid} />

                {design.files.length === 0 ? (
                    <Text size="sm" c="ldGray.6" ta="center" py="md">
                        No files yet.
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
        </Group>
    );
};

export const DesignDetailPanel: FC<Props> = ({ designUuid }) => {
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
        return <Text c="ldGray.6">Theme not found.</Text>;
    }

    return <DesignForm key={design.designUuid} design={design} />;
};
