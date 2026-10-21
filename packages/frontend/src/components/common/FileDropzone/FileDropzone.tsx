import { Box, Button, Group, Stack, Text } from '@mantine/core';
import { IconFileUpload } from '@tabler/icons-react';
import clsx from 'clsx';
import { useId, useRef, useState, type FC } from 'react';
import MantineIcon from '../MantineIcon';
import classes from './FileDropzone.module.css';

type Props = {
    accept: string;
    description: string;
    disabled: boolean;
    onFiles: (files: File[]) => void;
    compact?: boolean;
};

const FileDropzone: FC<Props> = ({
    accept,
    description,
    disabled,
    onFiles,
    compact = false,
}) => {
    const inputId = useId();
    const input = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);

    return (
        <Box
            className={clsx(classes.dropzone, {
                [classes.dragging]: dragging && !disabled,
                [classes.disabled]: disabled,
                [classes.compact]: compact,
            })}
            onDragOver={(event) => {
                event.preventDefault();
                if (!disabled) setDragging(true);
            }}
            onDragLeave={(event) => {
                if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                ) {
                    setDragging(false);
                }
            }}
            onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (!disabled) onFiles(Array.from(event.dataTransfer.files));
            }}
        >
            <Stack align="center" gap="sm" className={classes.content}>
                <Box className={classes.icon}>
                    <MantineIcon icon={IconFileUpload} size="xl" />
                </Box>
                <Stack align="center" gap={4} className={classes.copy}>
                    <Text fw={500} size="sm">
                        Drag and drop your files here
                    </Text>
                    <Text
                        c="dimmed"
                        size="xs"
                        ta="center"
                        id={`${inputId}-hint`}
                    >
                        {description}
                    </Text>
                </Stack>
                <Group>
                    <Button
                        variant="default"
                        size="xs"
                        disabled={disabled}
                        onClick={() => input.current?.click()}
                    >
                        Browse files
                    </Button>
                </Group>
            </Stack>
            <Box
                component="input"
                ref={input}
                id={inputId}
                type="file"
                multiple
                accept={accept}
                disabled={disabled}
                aria-label="Choose files to upload"
                aria-describedby={`${inputId}-hint`}
                className={classes.input}
                onChange={(event) => {
                    onFiles(Array.from(event.currentTarget.files ?? []));
                    event.currentTarget.value = '';
                }}
            />
        </Box>
    );
};

export default FileDropzone;
