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

/** Lays sent-image tiles out right aligned under a message. */
export const ThreadImageTileRow: FC<PropsWithChildren> = ({ children }) => (
    <Box className={classes.tileRow}>{children}</Box>
);

type Props = {
    fileName: string;
    width: number;
    height: number;
    // Only the composer has the bytes; sent images show a placeholder.
    previewUrl: string | null;
    // A card sized by its grid cell, or a compact tile that hugs its content.
    layout: 'grid' | 'tile';
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
        p={layout === 'tile' ? 6 : 'xs'}
        className={`${classes.card} ${layout === 'tile' ? classes.tile : ''}`}
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
                <Box className={classes.placeholder} data-layout={layout}>
                    <MantineIcon icon={IconPhoto} size={16} color="dimmed" />
                </Box>
            )}
            <Stack gap={0} flex={1} miw={0}>
                <TruncatedText
                    maxWidth={layout === 'tile' ? 180 : '100%'}
                    fz="xs"
                >
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
