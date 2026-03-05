import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { Box, Tooltip } from '@mantine-8/core';
import { IconGripVertical } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
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
            style={{
                ...(hovered !== undefined && {
                    visibility: hovered ? 'visible' : 'hidden',
                }),
                opacity: disabled ? 0.3 : 0.6,
                cursor: disabled ? 'default' : 'grab',
            }}
        >
            <MantineIcon color="ldGray.6" icon={IconGripVertical} />
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
