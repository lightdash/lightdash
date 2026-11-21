import { ActionIcon, Group, Kbd, Paper, Text, Tooltip } from '@mantine/core';
import {
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
    micOn: boolean;
    onMicChange: (on: boolean) => void;
    onClose: () => void;
};

const DesignToolbar: FC<Props> = ({
    ref,
    holding,
    micOn,
    onMicChange,
    onClose,
}) => (
    <Paper
        ref={ref}
        tabIndex={-1}
        className={classes.toolbar}
        shadow="md"
        px="sm"
        py={6}
        {...{ [CAPTURE_IGNORE_ATTRIBUTE]: '' }}
    >
        <Group gap="sm" wrap="nowrap">
            <Text size="sm" fw={600}>
                Design Mode
            </Text>
            <Group
                gap={6}
                wrap="nowrap"
                className={classes.tool}
                data-active={holding}
            >
                <MantineIcon icon={IconPencil} />
                <Text size="sm">Mark</Text>
                <Kbd size="xs">Hold ⌥</Kbd>
                <Text size="xs" c="dimmed">
                    Click to pick, drag to draw
                </Text>
            </Group>
            <Tooltip
                label={micOn ? 'Mic on: talk while you mark' : 'Mic off: type'}
                withinPortal={false}
            >
                <ActionIcon
                    aria-label="Mic"
                    aria-pressed={micOn}
                    variant={micOn ? 'filled' : 'subtle'}
                    color={micOn ? 'red' : undefined}
                    onClick={() => onMicChange(!micOn)}
                >
                    <MantineIcon
                        icon={micOn ? IconMicrophone : IconMicrophoneOff}
                    />
                </ActionIcon>
            </Tooltip>
            <ActionIcon aria-label="Leave Design Mode" onClick={onClose}>
                <MantineIcon icon={IconX} />
            </ActionIcon>
        </Group>
    </Paper>
);

export default DesignToolbar;
