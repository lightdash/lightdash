import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Box } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import classes from './ControlSidebar.module.css';
import { DragGrip } from './SectionHeader';

type Props = {
    id: string;
    isDisabled: boolean;
    children: ReactNode;
};

// A closed row with its grip at the left, dragged within and between sections
export const SortableRow: FC<Props> = ({ id, isDisabled, children }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled: isDisabled });
    return (
        <Box
            ref={setNodeRef}
            className={classes.sortableRow}
            data-dragging={isDragging || undefined}
            style={{ transform: CSS.Translate.toString(transform), transition }}
        >
            {!isDisabled && (
                <DragGrip
                    label="Drag to reorder"
                    attributes={attributes}
                    listeners={listeners}
                />
            )}
            {children}
        </Box>
    );
};
