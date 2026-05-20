import { type ApiOrganizationDesignFile } from '@lightdash/common';
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
} from '@mantine-8/core';
import { IconDownload, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    useClearDefaultOrganizationDesign,
    useDeleteDesignFile,
    useOrganizationDesign,
    useSetDefaultOrganizationDesign,
    useUpdateOrganizationDesign,
} from '../hooks/useOrganizationDesigns';
import { DesignFileUpload } from './DesignFileUpload';

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

export const DesignDetailPanel: FC<Props> = ({ designUuid }) => {
    const { data: design, isInitialLoading } =
        useOrganizationDesign(designUuid);
    const updateDesign = useUpdateOrganizationDesign();
    const setDefault = useSetDefaultOrganizationDesign();
    const clearDefault = useClearDefaultOrganizationDesign();
    const deleteFile = useDeleteDesignFile();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [pendingDeleteUuid, setPendingDeleteUuid] = useState<string | null>(
        null,
    );

    // Sync local form state when the loaded design changes (initial load,
    // refetch after upload/delete, switching between designs).
    useEffect(() => {
        if (design) {
            setName(design.name);
            setDescription(design.description ?? '');
        }
    }, [design]);

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const hasChanges = useMemo(() => {
        if (!design) return false;
        return (
            trimmedName !== design.name ||
            trimmedDescription !== (design.description ?? '')
        );
    }, [design, trimmedName, trimmedDescription]);

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

    const handleSave = () => {
        if (!hasChanges || !trimmedName) return;
        updateDesign.mutate({
            designUuid: design.designUuid,
            data: {
                name: trimmedName,
                description: trimmedDescription || null,
            },
        });
    };

    return (
        <Group align="stretch" gap="lg" wrap="nowrap">
            {/* Left column: metadata + actions */}
            <Stack gap="md" flex={1}>
                <Box>
                    <Title order={6}>Details</Title>
                </Box>
                <TextInput
                    label="Name"
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    required
                />
                <Textarea
                    label="Description"
                    value={description}
                    onChange={(e) => setDescription(e.currentTarget.value)}
                    minRows={3}
                    autosize
                />
                <Group justify="flex-start">
                    <Button
                        variant="filled"
                        size="xs"
                        onClick={handleSave}
                        disabled={!hasChanges || !trimmedName}
                        loading={updateDesign.isLoading}
                    >
                        Save changes
                    </Button>
                </Group>

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
