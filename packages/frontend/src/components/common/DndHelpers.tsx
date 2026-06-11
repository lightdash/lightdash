import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Box, useMantineTheme } from '@mantine-8/core';
import { useMemo, type FC, type ReactNode } from 'react';

export const DraggableItem: FC<{
    id: string;
    children: ReactNode;
    disabled?: boolean;
}> = ({ id, children, disabled }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id,
        disabled,
    });

    const style = transform
        ? ({
              position: 'relative',
              zIndex: 1,
              transform: `translate(${transform.x}px, ${transform.y}px)`,
              opacity: 0.8,
          } as const)
        : undefined;

    return (
        <Box ref={setNodeRef} style={style} {...listeners} {...attributes}>
            {children}
        </Box>
    );
};

export const DroppableArea: FC<{
    id: string;
    children: ReactNode;
    orderedKeys: string[];
}> = ({ id, children, orderedKeys }) => {
    const { active, isOver, over, setNodeRef } = useDroppable({ id });
    const { colors } = useMantineTheme();

    const placeholderStyle = useMemo(() => {
        if (isOver && active && over && active.id !== over.id) {
            const oldIndex = orderedKeys.indexOf(String(active.id));
            const newIndex = orderedKeys.indexOf(String(over.id));
            if (newIndex < oldIndex) {
                return { boxShadow: `-8px 0px ${colors.blue[4]}` };
            } else if (newIndex > oldIndex) {
                return { boxShadow: `8px 0px ${colors.blue[4]}` };
            }
        }
    }, [isOver, active, over, orderedKeys, colors]);

    return (
        <Box ref={setNodeRef} style={placeholderStyle}>
            {children}
        </Box>
    );
};
