import { Box, Group, Image, Paper, Stack, Text } from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import { type FC, type PropsWithChildren, type ReactNode } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import TruncatedText from '../../../../../components/common/TruncatedText';
import classes from './ThreadImageCard.module.css';

/** Lays image cards out in two equal columns. */
export const ThreadImageGrid: FC<PropsWithChildren> = ({ children }) => (
    <Box className={classes.gridContainer}>
        <Box className={classes.grid}>{children}</Box>
    </Box>
);

type Props = {
    fileName: string;
    width: number;
    height: number;
    // Only the composer has the bytes; sent images show a placeholder.
    previewUrl: string | null;
    // Sized by its grid cell, or on its own at a fixed width.
    layout: 'grid' | 'standalone';
    action: ReactNode;
};

export const ThreadImageCard: FC<Props> = ({
    fileName,
    width,
    height,
    previewUrl,
    layout,
    action,
}) => (
    <Paper
        p="xs"
        className={`${classes.card} ${layout === 'standalone' ? classes.standalone : ''}`}
    >
        <Group gap="xs" wrap="nowrap">
            {previewUrl ? (
                <Image
                    src={previewUrl}
                    alt={fileName}
                    w={64}
                    h={48}
                    fit="contain"
                    flex="none"
                />
            ) : (
                <Box className={classes.placeholder}>
                    <MantineIcon icon={IconPhoto} size={20} color="dimmed" />
                </Box>
            )}
            <Stack gap={0} flex={1} miw={0}>
                <TruncatedText maxWidth="100%" fz="xs">
                    {fileName}
                </TruncatedText>
                <Text size="xs" c="dimmed">
                    {width}×{height}
                </Text>
            </Stack>
            {action}
        </Group>
    </Paper>
);
