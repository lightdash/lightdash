import { Box, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { type FC, type ReactNode, type RefObject } from 'react';
import { focusOnMount } from './mappingFocus';
import classes from './TileOverlay.module.css';
import { type TileHighlight } from './tileProps';
import { LOCKED_TILE_CLASS } from './tileSelector';

// A tile the control cannot reach recedes, with nothing on top of it; the
// reason is its hint
export const TileVeil: FC<{ title: string }> = ({ title }) => (
    <div
        className={`${classes.overlay} ${classes.unfilterable} ${LOCKED_TILE_CLASS}`}
        data-controls-overlay
        title={title}
    />
);

// A reachable tile while a control's tiles are chosen: the veil with its
// hint, the ring, the card
export const TileCard: FC<{
    overlayRef?: RefObject<HTMLDivElement | null>;
    highlight: TileHighlight | null;
    /** The veil's hint. */
    title: string;
    children: ReactNode;
}> = ({ overlayRef, highlight, title, children }) => (
    <div
        ref={overlayRef}
        className={`${classes.overlay} ${LOCKED_TILE_CLASS}`}
        data-controls-overlay
        data-highlighted={highlight ?? undefined}
        title={title}
    >
        <Box className={classes.ring} aria-hidden />
        {/* An empty title keeps the veil's hint off the card */}
        <Paper
            shadow="md"
            p="sm"
            radius="md"
            className={classes.card}
            title=""
            // Escape from a card leaves mapping as the row's Cancel does
            data-controls-editor
        >
            {children}
        </Paper>
    </div>
);

// A control named inside a sentence: the one part that reads at full weight
export const ControlName: FC<{ name: string }> = ({ name }) => (
    <Text span inherit fw={600} c="text">
        {name}
    </Text>
);

// "Move from X?", on its own line so a long name has room
export const MoveQuestion: FC<{
    question: ReactNode;
    onAnswer: (isMove: boolean) => void;
}> = ({ question, onAnswer }) => (
    <Stack gap="xs">
        <Text fz="xs" role="status">
            {question}
        </Text>
        <Group gap="xs" wrap="nowrap" justify="flex-end">
            <Button variant="subtle" size="xs" onClick={() => onAnswer(false)}>
                Cancel
            </Button>
            {/* The row's Apply is the one filled button */}
            <Button
                variant="default"
                size="xs"
                ref={focusOnMount}
                onClick={() => onAnswer(true)}
            >
                Move
            </Button>
        </Group>
    </Stack>
);
