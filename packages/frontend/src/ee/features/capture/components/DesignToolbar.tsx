import { Box, Group, Kbd, Paper, Tooltip, UnstyledButton } from '@mantine/core';
import {
    IconClick,
    IconMicrophone,
    IconMicrophoneOff,
    IconPencil,
    IconX,
} from '@tabler/icons-react';
import { type FC, type Ref } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { CAPTURE_IGNORE_ATTRIBUTE } from '../frameSource';
import classes from './DesignToolbar.module.css';

type Props = {
    /** Takes focus when Design Mode turns on, so the hold key reaches the page. */
    ref: Ref<HTMLDivElement> | null;
    /** Option is held now. */
    holding: boolean;
    /** The mic is recording the hold. */
    talking: boolean;
    micOn: boolean;
    onMicChange: (on: boolean) => void;
    onClose: () => void;
};

// A dashed selection with a pointer in the brand colour.
const ModeIcon: FC = () => (
    <svg
        aria-hidden="true"
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <g className={classes.modeIconFrame}>
            <path d="M5 3a2 2 0 0 0-2 2" />
            <path d="M19 3a2 2 0 0 1 2 2" />
            <path d="M5 21a2 2 0 0 1-2-2" />
            <path d="M9 3h1" />
            <path d="M9 21h2" />
            <path d="M14 3h1" />
            <path d="M3 9v1" />
            <path d="M21 9v2" />
            <path d="M3 14v1" />
        </g>
        <path
            className={classes.modeIconPointer}
            d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"
        />
    </svg>
);

const DesignToolbar: FC<Props> = ({
    ref,
    holding,
    talking,
    micOn,
    onMicChange,
    onClose,
}) => (
    <Paper
        ref={ref}
        tabIndex={-1}
        role="toolbar"
        aria-label="Design Mode"
        className={classes.toolbar}
        {...{ [CAPTURE_IGNORE_ATTRIBUTE]: '' }}
    >
        <Tooltip label="Design Mode" withinPortal={false}>
            <Box className={classes.tile}>
                <Box className={classes.tileIcon}>
                    <ModeIcon />
                </Box>
            </Box>
        </Tooltip>
        <Box className={classes.divider} aria-hidden="true" />
        <Box
            className={classes.chip}
            data-active={holding}
            data-recording={holding && talking}
        >
            {holding ? (
                <>
                    {talking && (
                        <Box className={classes.recordingDot} aria-hidden />
                    )}
                    <Group gap={5} wrap="nowrap">
                        <MantineIcon icon={IconClick} size={14} stroke={2} />
                        Mark
                    </Group>
                    <Group gap={5} wrap="nowrap" ml={8}>
                        <MantineIcon icon={IconPencil} size={14} stroke={2} />
                        Annotate
                    </Group>
                </>
            ) : (
                <Group gap={6} wrap="nowrap">
                    Hold
                    <Kbd className={classes.keycap}>⌥</Kbd>
                    to activate
                </Group>
            )}
        </Box>
        <Box className={classes.divider} aria-hidden="true" />
        <Tooltip
            label={
                micOn
                    ? 'Voice on: talk while you hold ⌥, release to send'
                    : 'Voice off: mark, then type'
            }
            withinPortal={false}
        >
            <UnstyledButton
                aria-label="Voice"
                aria-pressed={micOn}
                className={classes.button}
                data-on={micOn}
                onClick={() => onMicChange(!micOn)}
            >
                <MantineIcon
                    icon={micOn ? IconMicrophone : IconMicrophoneOff}
                    size={16}
                    stroke={2}
                />
            </UnstyledButton>
        </Tooltip>
        <UnstyledButton
            aria-label="Leave Design Mode"
            className={classes.button}
            onClick={onClose}
        >
            <MantineIcon icon={IconX} size={16} stroke={2} />
        </UnstyledButton>
    </Paper>
);

export default DesignToolbar;
