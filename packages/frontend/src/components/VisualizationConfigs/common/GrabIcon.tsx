import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { Box } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
    hovered?: boolean;
};

export const GrabIcon: FC<Props> = ({ dragHandleProps, hovered }) => (
    <Box
        {...dragHandleProps}
        sx={{
            ...(hovered !== undefined && {
                visibility: hovered ? 'visible' : 'hidden',
            }),
            opacity: 0.6,
            cursor: 'grab',
            '&:hover': { opacity: 1 },
        }}
    >
        <MantineIcon color="gray.6" icon={IconGripVertical} />
    </Box>
);
