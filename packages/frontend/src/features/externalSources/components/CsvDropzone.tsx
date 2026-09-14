import { MAX_EXTERNAL_SOURCE_FILE_BYTES } from '@lightdash/common';
import { Box, Loader, Stack, Text } from '@mantine/core';
import { IconCloudUpload } from '@tabler/icons-react';
import { useId, useState, type ChangeEvent, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import useToaster from '../../../hooks/toaster/useToaster';
import classes from './CsvDropzone.module.css';

const ACCEPT = '.csv,.tsv';

const formatMb = (bytes: number): string =>
    `${Math.round(bytes / (1024 * 1024))} MB`;

type Props = {
    isUploading: boolean;
    onFile: (file: File) => void;
};

/**
 * A label-for-input dropzone: the OS file chooser opens through the native
 * label association, with no JS in the path, so it works in every browser
 * and inside modals. Rejects doomed uploads client-side so a too-big file
 * never hits the wire.
 */
export const CsvDropzone: FC<Props> = ({ isUploading, onFile }) => {
    const { showToastError } = useToaster();
    const [isDragging, setIsDragging] = useState(false);
    const inputId = useId();

    const handleFile = (file: File) => {
        const lower = file.name.toLowerCase();
        if (!lower.endsWith('.csv') && !lower.endsWith('.tsv')) {
            showToastError({
                title: `Unsupported file: ${file.name}`,
                subtitle: 'Upload a .csv or .tsv file.',
            });
            return;
        }
        if (file.size > MAX_EXTERNAL_SOURCE_FILE_BYTES) {
            showToastError({
                title: `${file.name} is too large`,
                subtitle: `Files must be under ${formatMb(
                    MAX_EXTERNAL_SOURCE_FILE_BYTES,
                )}.`,
            });
            return;
        }
        if (file.size === 0) {
            showToastError({
                title: `${file.name} is empty`,
                subtitle: 'Upload a file with at least a header row.',
            });
            return;
        }
        onFile(file);
    };

    const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && !isUploading) handleFile(file);
        // Reset so choosing the same file again re-fires the change event
        // eslint-disable-next-line no-param-reassign
        event.target.value = '';
    };

    return (
        <>
            <Box
                component="label"
                htmlFor={inputId}
                className={`${classes.dropzone} ${
                    isDragging ? classes.dropzoneActive : ''
                }`}
                onDragEnter={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                }}
                onDragLeave={(e) => {
                    if (
                        !e.currentTarget.contains(
                            e.relatedTarget as Node | null,
                        )
                    ) {
                        setIsDragging(false);
                    }
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (isUploading) return;
                    const file = e.dataTransfer.files[0];
                    if (file) handleFile(file);
                }}
            >
                <Stack gap="xs" align="center">
                    {isUploading ? (
                        <Loader size="sm" />
                    ) : (
                        <MantineIcon
                            icon={IconCloudUpload}
                            size="lg"
                            color="ldGray.7"
                        />
                    )}
                    <Text fz="sm" fw={500} ta="center">
                        {isUploading
                            ? 'Uploading and analyzing…'
                            : 'Drop a CSV here or click to browse'}
                    </Text>
                    <Text fz="xs" c="dimmed" ta="center">
                        .csv or .tsv, up to{' '}
                        {formatMb(MAX_EXTERNAL_SOURCE_FILE_BYTES)}
                    </Text>
                </Stack>
            </Box>
            <input
                id={inputId}
                type="file"
                accept={ACCEPT}
                disabled={isUploading}
                aria-label="Upload a CSV file"
                className={classes.hiddenInput}
                onChange={handleInputChange}
            />
        </>
    );
};
