import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type DashboardControlSection } from '@lightdash/common';
import { ActionIcon, Box, Menu, Text, TextInput } from '@mantine/core';
import {
    IconChevronRight,
    IconDots,
    IconGripVertical,
} from '@tabler/icons-react';
import { useRef, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './ControlSidebar.module.css';

type GripProps = {
    label: string;
    attributes: ReturnType<typeof useSortable>['attributes'];
    listeners: ReturnType<typeof useSortable>['listeners'];
};

// The drag handle: a button of its own, shown on hover and focus. It owns
// Escape so cancelling a keyboard drag does not close the rail
export const DragGrip: FC<GripProps> = ({ label, attributes, listeners }) => (
    <Box
        component="button"
        type="button"
        className={classes.grip}
        aria-label={label}
        data-own-escape
        {...attributes}
        {...listeners}
    >
        <MantineIcon icon={IconGripVertical} size={14} color="dimmed" />
    </Box>
);

type NameInputProps = {
    name: string;
    onCommit: (name: string) => void;
    onCancel: () => void;
};

// Enter or blur with a name commits; Escape or an empty name cancels
const SectionNameInput: FC<NameInputProps> = ({ name, onCommit, onCancel }) => {
    const isDone = useRef(false);
    const finish = (value: string) => {
        if (isDone.current) return;
        isDone.current = true;
        const trimmed = value.trim();
        if (trimmed === '') onCancel();
        else onCommit(trimmed);
    };
    return (
        <TextInput
            aria-label="Section name"
            placeholder="Section name"
            size="xs"
            className={classes.nameInput}
            classNames={{ input: classes.nameInputField }}
            defaultValue={name}
            autoFocus
            data-own-escape
            onBlur={(event) => finish(event.currentTarget.value)}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    finish(event.currentTarget.value);
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    finish('');
                }
            }}
        />
    );
};

type Props = {
    section: DashboardControlSection;
    countLabel: string;
    isCollapsed: boolean;
    isEditingName: boolean;
    isDragDisabled: boolean;
    onToggle: () => void;
    onRename: () => void;
    onCommitName: (name: string) => void;
    onCancelName: () => void;
    onRemove: () => void;
};

// A filled band over its rows: grip, chevron, name, count and the menu
export const SectionHeader: FC<Props> = ({
    section,
    countLabel,
    isCollapsed,
    isEditingName,
    isDragDisabled,
    onToggle,
    onRename,
    onCommitName,
    onCancelName,
    onRemove,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: section.id, disabled: isDragDisabled });
    const name = section.name || 'Untitled section';
    return (
        <Box
            ref={setNodeRef}
            className={classes.sectionHeader}
            data-dragging={isDragging || undefined}
            data-controls-section={section.id}
            style={{ transform: CSS.Translate.toString(transform), transition }}
        >
            <Box className={classes.sectionHeadRow}>
                {!isDragDisabled && (
                    <DragGrip
                        label="Drag to reorder section"
                        attributes={attributes}
                        listeners={listeners}
                    />
                )}
                <ActionIcon
                    variant="subtle"
                    size="sm"
                    aria-label={
                        isCollapsed
                            ? `Expand section ${name}`
                            : `Collapse section ${name}`
                    }
                    aria-expanded={!isCollapsed}
                    onClick={onToggle}
                >
                    <MantineIcon
                        icon={IconChevronRight}
                        size={14}
                        className={classes.chevron}
                    />
                </ActionIcon>
                {isEditingName ? (
                    <SectionNameInput
                        name={section.name}
                        onCommit={onCommitName}
                        onCancel={onCancelName}
                    />
                ) : (
                    <Text fz="sm" fw={600} truncate flex={1}>
                        {name}
                    </Text>
                )}
                <Text fz="xs" c="dimmed" flex="0 0 auto">
                    {countLabel}
                </Text>
                {/* Focus must stay on the name input Rename opens */}
                <Menu position="bottom-end" returnFocus={false}>
                    <Menu.Target>
                        <ActionIcon
                            variant="subtle"
                            size="sm"
                            className={classes.sectionMenu}
                            aria-label={`Section ${name} actions`}
                            data-controls-section-menu
                        >
                            <MantineIcon icon={IconDots} size={14} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item fz="xs" onClick={onRename}>
                            Rename
                        </Menu.Item>
                        <Menu.Item fz="xs" color="red" onClick={onRemove}>
                            Remove section
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Box>
        </Box>
    );
};

type DropZoneProps = { id: string; label: string; isDisabled: boolean };

// An empty section's drop target, or the unsectioned area's
export const SectionDropZone: FC<DropZoneProps> = ({
    id,
    label,
    isDisabled,
}) => {
    const { setNodeRef, isOver } = useDroppable({ id, disabled: isDisabled });
    return (
        <Box
            ref={setNodeRef}
            className={classes.dropZone}
            data-over={isOver || undefined}
        >
            <Text fz="xs" c="dimmed">
                {label}
            </Text>
        </Box>
    );
};
