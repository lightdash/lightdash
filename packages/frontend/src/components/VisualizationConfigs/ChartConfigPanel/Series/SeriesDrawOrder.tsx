import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconArrowsUpDown,
    IconStack2,
    IconStackFront,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../common/MantineIcon';
import styles from './seriesDrawOrder.module.css';

export type SeriesDrawOrderControl = {
    isFront: boolean;
    onBringToFront: () => void;
};

type SeriesDrawOrderBarProps = {
    canReorder: boolean;
    onReverse: () => void;
};

export const SeriesDrawOrderBar: FC<SeriesDrawOrderBarProps> = ({
    canReorder,
    onReverse,
}) => (
    <Group className={styles.orderBar} px="xs" py="two" wrap="nowrap">
        <MantineIcon icon={IconStack2} color="ldGray.6" />
        <Text size="xs" c="dimmed">
            Draw order{' '}
            <Text span inherit fw={600} c="ldGray.9">
                Back
            </Text>
            {' → '}
            <Text span inherit fw={600} c="ldGray.9">
                Front
            </Text>
        </Text>
        {canReorder && (
            <Tooltip
                label="Flip the order of every series"
                position="top"
                openDelay={300}
                withinPortal
            >
                <Button
                    ml="auto"
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    leftSection={<MantineIcon icon={IconArrowsUpDown} />}
                    onClick={onReverse}
                >
                    Reverse
                </Button>
            </Tooltip>
        )}
    </Group>
);

type SeriesDepthControlProps = {
    control: SeriesDrawOrderControl;
};

// Fixed-width slot so revealing the action on hover can't resize the series name field.
export const SeriesDepthControl: FC<SeriesDepthControlProps> = ({
    control,
}) => (
    <Group className={styles.depthSlot} justify="flex-end" wrap="nowrap">
        {control.isFront ? (
            <Badge size="xs" radius="sm" variant="light">
                Front
            </Badge>
        ) : (
            <Tooltip
                label="Bring to front"
                position="top"
                openDelay={300}
                withinPortal
            >
                <ActionIcon
                    className={styles.frontAction}
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Bring to front"
                    onClick={control.onBringToFront}
                >
                    <MantineIcon icon={IconStackFront} />
                </ActionIcon>
            </Tooltip>
        )}
    </Group>
);
