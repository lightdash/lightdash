import { Box, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import styles from './QueryNodeReference.module.css';

type Props = {
    nodeId: string;
    index: number | null;
    /** The model's link label, shown in the tooltip only. */
    label: ReactNode;
    isActive: boolean;
    /** Null where no preview pane can open the query. */
    onOpen: (() => void) | null;
};

/** A numbered chip citing the query node a figure rests on. */
export const QueryNodeReference: FC<Props> = ({
    nodeId,
    index,
    label,
    isActive,
    onOpen,
}) => (
    <Tooltip
        withinPortal
        label={
            <Stack gap={2}>
                <Text fz="xs" fw={500}>
                    {label}
                </Text>
                <Text fz="xs" ff="monospace" c="dimmed">
                    {nodeId}
                </Text>
            </Stack>
        }
    >
        {onOpen ? (
            <UnstyledButton
                className={styles.marker}
                aria-label={`Open query ${nodeId}`}
                data-active={isActive || undefined}
                onClick={onOpen}
            >
                {index ?? '·'}
            </UnstyledButton>
        ) : (
            <Box component="span" className={styles.marker}>
                {index ?? '·'}
            </Box>
        )}
    </Tooltip>
);
