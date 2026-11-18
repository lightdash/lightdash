import { Group, Loader, Text } from '@mantine/core';
import {
    IconAlertTriangle,
    IconCircle,
    IconCircleCheck,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

export type TaskState = 'done' | 'running' | 'failed' | 'todo';

const ICONS = {
    done: <MantineIcon icon={IconCircleCheck} size={14} color="green" />,
    running: <Loader size={12} color="gray" />,
    failed: <MantineIcon icon={IconAlertTriangle} size={14} color="yellow" />,
    todo: <MantineIcon icon={IconCircle} size={14} color="ldGray.4" />,
} satisfies Record<TaskState, ReactNode>;

/** One step of a change, ticked off as it happens. */
export const Task: FC<{ state: TaskState; label: string }> = ({
    state,
    label,
}) => (
    <Group gap={4} wrap="nowrap" flex="none">
        {ICONS[state]}
        <Text fz="xs" c={state === 'todo' ? 'dimmed' : undefined}>
            {label}
        </Text>
    </Group>
);

export const TaskIcon: FC<{ state: TaskState }> = ({ state }) => ICONS[state];
