import { Box, Tooltip } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import clsx from 'clsx';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { type SortableHandleProps } from '../../common/Sortable/Sortable';
import classes from './GrabIcon.module.css';

type Props = {
    dragHandleProps?: SortableHandleProps | null;
    hovered?: boolean;
    disabled?: boolean;
    disabledTooltip?: string;
};

export const GrabIcon: FC<Props> = ({
    dragHandleProps,
    hovered,
    disabled,
    disabledTooltip,
}) => {
    const icon = (
        <Box
            {...dragHandleProps}
            opacity={disabled ? 0.3 : 0.6}
            className={clsx(dragHandleProps?.className, classes.grabHandle)}
            data-disabled={disabled || undefined}
            data-hidden={hovered === false || undefined}
        >
            <MantineIcon color="dimmed" icon={IconGripVertical} />
        </Box>
    );

    if (disabled && disabledTooltip) {
        return (
            <Tooltip label={disabledTooltip} position="top" openDelay={300}>
                {icon}
            </Tooltip>
        );
    }

    return icon;
};
