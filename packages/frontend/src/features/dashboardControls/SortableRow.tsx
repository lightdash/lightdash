import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Box } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { ConfirmDeleteButton } from '../../components/common/ConfirmDeleteButton';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import classes from './ControlSidebar.module.css';
import { DragGrip } from './SectionHeader';

type Props = {
    id: string;
    isDisabled: boolean;
    /** A section's member: indented under its header. */
    isInSection: boolean;
    /** The expanded editor: the grip sits by its head, not the card's centre. */
    isExpanded: boolean;
    /** A closed row's remove, shown on hover and focus; null for a viewer. */
    onRemove: (() => void) | null;
    children: ReactNode;
};

// A row with its grip at the left, dragged within and between sections
export const SortableRow: FC<Props> = ({
    id,
    isDisabled,
    isInSection,
    isExpanded,
    onRemove,
    children,
}) => {
    const getUiString = useUiStrings();
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
    } = useSortable({ id, disabled: isDisabled });
    return (
        <Box
            ref={setNodeRef}
            className={
                isInSection
                    ? `${classes.sortableRow} ${classes.sectionRow}`
                    : classes.sortableRow
            }
            data-dragging={isDragging || undefined}
            data-over={(isOver && !isDragging) || undefined}
            data-expanded={isExpanded || undefined}
            data-removable={onRemove !== null || undefined}
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
            {onRemove && (
                <Box className={classes.rowRemove}>
                    <ConfirmDeleteButton
                        size="sm"
                        data-own-escape
                        aria-label={getUiString('filters.rail.removeFilter')}
                        tooltip={getUiString('filters.rail.confirmRemove')}
                        onConfirm={onRemove}
                    >
                        <MantineIcon icon={IconTrash} size={14} />
                    </ConfirmDeleteButton>
                </Box>
            )}
        </Box>
    );
};
