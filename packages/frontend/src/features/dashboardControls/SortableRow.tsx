import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Box, Checkbox } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { ConfirmDeleteButton } from '../../components/common/ConfirmDeleteButton';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import classes from './ControlSidebar.module.css';
import { DragGrip } from './SectionHeader';

export type RowSelection = {
    /** The filter's name, for the checkbox. */
    label: string;
    isChecked: boolean;
    onToggle: (isRange: boolean) => void;
};

type Props = {
    id: string;
    /** What the grip says it drags. */
    name: string;
    isDisabled: boolean;
    /** A section's member: indented under its header. */
    isInSection: boolean;
    /** The expanded editor: the grip sits by its head, not the card's centre. */
    isExpanded: boolean;
    /** A closed row's remove, shown on hover and focus; null for a viewer. */
    onRemove: (() => void) | null;
    /** Select mode: a checkbox in the grip's slot; null outside it. */
    selection: RowSelection | null;
    children: ReactNode;
};

// A row with its grip at the left, dragged within and between sections
export const SortableRow: FC<Props> = ({
    id,
    name,
    isDisabled,
    isInSection,
    isExpanded,
    onRemove,
    selection,
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
            data-controls-sortable
            data-selecting={selection !== null || undefined}
            style={{ transform: CSS.Translate.toString(transform), transition }}
        >
            {!isDisabled && (
                <DragGrip
                    label={`Drag to reorder ${name}`}
                    attributes={attributes}
                    listeners={listeners}
                />
            )}
            {selection && (
                <Box className={classes.rowCheck}>
                    <Checkbox
                        size="xs"
                        // The row is the list's tab stop; Space toggles it
                        tabIndex={-1}
                        aria-label={selection.label}
                        checked={selection.isChecked}
                        // A click's change event carries the mouse event
                        onChange={(event) =>
                            selection.onToggle(
                                event.nativeEvent instanceof MouseEvent &&
                                    event.nativeEvent.shiftKey,
                            )
                        }
                    />
                </Box>
            )}
            {children}
            {onRemove && (
                <Box className={classes.rowRemove}>
                    <ConfirmDeleteButton
                        size="sm"
                        tabIndex={-1}
                        tooltipProps={{ position: 'left', withinPortal: true }}
                        data-own-escape
                        data-controls-remove
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
