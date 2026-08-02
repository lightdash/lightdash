import {
    checkThemeLimits,
    MAX_THEME_FILE_BYTES,
    themeLimitMessage,
    type ApiOrganizationDesignFile,
    type OrganizationDesignFileKind,
} from '@lightdash/common';
import { Box, FileButton, Group, Loader, Stack, Text } from '@mantine-8/core';
import { IconUpload } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import useToaster from '../../../hooks/toaster/useToaster';
import { useUploadDesignFile } from '../hooks/useOrganizationDesigns';
import classes from './DesignFileUpload.module.css';

const ACCEPT = [
    '.css',
    '.md',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
    '.woff',
    '.woff2',
    '.ttf',
    '.otf',
].join(',');

// Extension → kind. Filename extension is authoritative — the backend
// re-validates the same mapping plus magic bytes and rejects mismatches.
const EXTENSION_TO_KIND: Record<string, OrganizationDesignFileKind> = {
    '.css': 'css',
    '.md': 'instruction',
    '.png': 'image',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.gif': 'image',
    '.webp': 'image',
    '.svg': 'image',
    '.woff': 'font',
    '.woff2': 'font',
    '.ttf': 'font',
    '.otf': 'font',
};

const inferKind = (filename: string): OrganizationDesignFileKind | null => {
    const lower = filename.toLowerCase();
    const dot = lower.lastIndexOf('.');
    if (dot === -1) return null;
    return EXTENSION_TO_KIND[lower.slice(dot)] ?? null;
};

const formatMb = (bytes: number): string =>
    `${Math.round(bytes / (1024 * 1024))} MB`;

type Props = {
    designUuid: string;
    themeName: string;
    existingFiles: ApiOrganizationDesignFile[];
};

export const DesignFileUpload: FC<Props> = ({
    designUuid,
    themeName,
    existingFiles,
}) => {
    const uploadFile = useUploadDesignFile();
    const { showToastError } = useToaster();
    const [isDragging, setIsDragging] = useState(false);

    const handleFiles = (files: File[]) => {
        // Validate against the theme guardrails client-side before uploading.
        // The backend enforces the same limits, but rejecting a large upload
        // mid-flight resets the connection and surfaces as a generic network
        // error instead of the real message — so catch it here and never send
        // a doomed upload. `accepted` seeds the running tally from the theme's
        // stored files and grows across this batch.
        const accepted: Pick<ApiOrganizationDesignFile, 'sizeBytes'>[] =
            existingFiles.map((f) => ({ sizeBytes: f.sizeBytes }));
        const queue: { file: File; kind: OrganizationDesignFileKind }[] = [];

        for (const file of files) {
            const kind = inferKind(file.name);
            if (!kind) {
                showToastError({
                    title: `Unsupported file: ${file.name}`,
                    subtitle:
                        'Allowed: .css, .md, .png, .jpg, .jpeg, .gif, .webp, .svg, .woff, .woff2, .ttf, .otf',
                });
                continue;
            }
            if (file.size > MAX_THEME_FILE_BYTES) {
                showToastError({
                    title: `${file.name} is too large`,
                    subtitle: `Files must be under ${formatMb(
                        MAX_THEME_FILE_BYTES,
                    )}.`,
                });
                continue;
            }
            const violation = checkThemeLimits([
                ...accepted,
                { sizeBytes: file.size },
            ]);
            if (violation) {
                showToastError({
                    title: `Can't add ${file.name}`,
                    subtitle: themeLimitMessage(violation, themeName),
                });
                continue;
            }
            accepted.push({ sizeBytes: file.size });
            queue.push({ file, kind });
        }

        // Upload sequentially so the backend's `Content-Length` accounting and
        // the optimistic toast feedback stay readable. Parallel uploads would
        // race the parent-design `updated_at` bumps in any case.
        const uploadNext = (index: number) => {
            if (index >= queue.length) return;
            const { file, kind } = queue[index];
            uploadFile.mutate(
                { designUuid, file, kind, filename: file.name },
                {
                    onSettled: () => uploadNext(index + 1),
                },
            );
        };
        uploadNext(0);
    };

    return (
        <Box
            className={`${classes.dropzone} ${
                isDragging ? classes.dropzoneActive : ''
            }`}
            onDragEnter={(e) => {
                e.preventDefault();
                setIsDragging(true);
            }}
            onDragOver={(e) => {
                // Necessary to allow drops.
                e.preventDefault();
            }}
            onDragLeave={(e) => {
                // Only clear when the cursor leaves the dropzone itself, not a
                // child element.
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setIsDragging(false);
                }
            }}
            onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) handleFiles(files);
            }}
        >
            <Stack gap="xs" align="center" py="md">
                {uploadFile.isLoading ? (
                    <Loader size="sm" />
                ) : (
                    <MantineIcon icon={IconUpload} size="lg" color="dimmed" />
                )}
                <Text size="sm" c="ldGray.6" ta="center">
                    {uploadFile.isLoading
                        ? 'Uploading…'
                        : 'Drop files here or click to browse'}
                </Text>
                <Group gap="xs">
                    <FileButton
                        onChange={(files) => {
                            // FileButton invokes onChange with a single File
                            // or File[] depending on `multiple`. We use
                            // multiple here.
                            if (!files) return;
                            const arr = Array.isArray(files) ? files : [files];
                            if (arr.length > 0) handleFiles(arr);
                        }}
                        accept={ACCEPT}
                        multiple
                        inputProps={{
                            'aria-label': 'Upload theme files',
                        }}
                    >
                        {(props) => (
                            <Text
                                {...props}
                                size="xs"
                                c="blue.6"
                                component="button"
                                type="button"
                                className={classes.browseButton}
                            >
                                Browse files
                            </Text>
                        )}
                    </FileButton>
                </Group>
            </Stack>
        </Box>
    );
};
