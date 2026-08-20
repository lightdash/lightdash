import { MAX_EXTERNAL_SOURCE_FILE_BYTES } from '@lightdash/common';
import { Box, FileButton, Loader, Stack, Text } from '@mantine/core';
import { IconCloudUpload } from '@tabler/icons-react';
import { useState, type FC } from 'react';
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
 * Hand-rolled dropzone (drag events + FileButton) — @mantine/dropzone is not
 * a dependency. Rejects doomed uploads client-side so a too-big file never
 * hits the wire.
 */
export const CsvDropzone: FC<Props> = ({ isUploading, onFile }) => {
    const { showToastError } = useToaster();
    const [isDragging, setIsDragging] = useState(false);

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

    return (
        <FileButton
            onChange={(file) => {
                if (file && !isUploading) handleFile(file);
            }}
            accept={ACCEPT}
            inputProps={{ 'aria-label': 'Upload a CSV file' }}
        >
            {({ onClick }) => (
                <Box
                    className={`${classes.dropzone} ${
                        isDragging ? classes.dropzoneActive : ''
                    }`}
                    onClick={isUploading ? undefined : onClick}
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
            )}
        </FileButton>
    );
};
