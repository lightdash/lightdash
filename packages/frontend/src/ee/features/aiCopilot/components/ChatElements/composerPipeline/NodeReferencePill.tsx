import { Box, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { type PipelineNode } from './groupPipeline';
import styles from './NodeReferencePill.module.css';

export const StepMarker: FC<{ marker: string }> = ({ marker }) => (
    <Box component="span" className={styles.marker} aria-hidden>
        {marker}
    </Box>
);

type Props = {
    node: Pick<PipelineNode, 'nodeId' | 'title'>;
    /** The node's type icon, or its letter within a merge. */
    leading: ReactNode;
    onJump: (nodeId: string) => void;
    onHighlight: (highlighted: boolean) => void;
    /** Shown on hover and keyboard focus. */
    details: ReactNode | null;
    active: boolean;
    /** Small marks after the title, such as a repeats-values icon. */
    trailing: ReactNode | null;
};

/** A step in the pipeline: jumps to its cell, highlights it while hovered or focused. */
export const NodeReferencePill: FC<Props> = ({
    node,
    leading,
    onJump,
    onHighlight,
    details,
    active,
    trailing,
}) => (
    <Tooltip
        label={details}
        disabled={details === null}
        events={{ hover: true, focus: true, touch: false }}
        multiline
        maw={320}
        openDelay={150}
    >
        <UnstyledButton
            className={styles.pill}
            data-active={active}
            onClick={(event) => {
                // The cell's own click would reselect this cell.
                event.stopPropagation();
                onJump(node.nodeId);
            }}
            onMouseEnter={() => onHighlight(true)}
            onMouseLeave={() => onHighlight(false)}
            onFocus={() => onHighlight(true)}
            onBlur={() => onHighlight(false)}
        >
            {leading}
            <Text component="span" inherit className={styles.title}>
                {node.title}
            </Text>
            {trailing}
        </UnstyledButton>
    </Tooltip>
);
