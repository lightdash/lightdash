import { ActionIcon, Group, Kbd, Paper, Text, Tooltip } from '@mantine/core';
import {
    IconMicrophone,
    IconMicrophoneOff,
    IconPencil,
    IconPointer,
    IconX,
} from '@tabler/icons-react';
import { type FC, type Ref } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { CAPTURE_IGNORE_ATTRIBUTE } from '../frameSource';
import { type DesignTool } from '../types';
import classes from './DesignToolbar.module.css';

type Props = {
    /** Takes focus when Design Mode turns on, so the hold keys reach the page. */
    ref: Ref<HTMLDivElement> | null;
    /** The tool being held now. */
    tool: DesignTool | null;
    micOn: boolean;
    onMicChange: (on: boolean) => void;
    onClose: () => void;
};

const TOOLS = [
    { tool: 'stylus', label: 'Stylus', hint: 'Hold ⌥', icon: IconPencil },
    { tool: 'cursor', label: 'Cursor', hint: 'Hold ⌃', icon: IconPointer },
] as const;

const DesignToolbar: FC<Props> = ({
    ref,
    tool,
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
            {TOOLS.map((item) => (
                <Group
                    key={item.tool}
                    gap={6}
                    wrap="nowrap"
                    className={classes.tool}
                    data-tool={item.tool}
                    data-active={tool === item.tool}
                >
                    <MantineIcon icon={item.icon} />
                    <Text size="sm">{item.label}</Text>
                    <Kbd size="xs">{item.hint}</Kbd>
                </Group>
            ))}
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
