import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    interpolateUiString,
    type DashboardControlSection,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Checkbox,
    Menu,
    Text,
    TextInput,
} from '@mantine/core';
import {
    IconChevronRight,
    IconDots,
    IconFilterPlus,
    IconGripVertical,
    IconPencil,
    IconTrash,
} from '@tabler/icons-react';
import { useRef, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import classes from './ControlSidebar.module.css';

type GripProps = {
    label: string;
    attributes: ReturnType<typeof useSortable>['attributes'];
    listeners: ReturnType<typeof useSortable>['listeners'];
};

// The drag handle: a button of its own, shown on hover and focus, reached
// from its row with Space rather than Tab. It owns Escape so cancelling a
// keyboard drag does not close the rail
export const DragGrip: FC<GripProps> = ({ label, attributes, listeners }) => (
    <Box
        component="button"
        type="button"
        className={`${classes.grip} mantine-focus-auto`}
        aria-label={label}
        data-own-escape
        data-controls-grip
        {...attributes}
        {...listeners}
        tabIndex={-1}
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
    /** Select mode: how many of a collapsed section's hidden rows are selected. */
    selectedLabel: string | null;
    isCollapsed: boolean;
    isEditingName: boolean;
    /** Not saved yet: a blur cancels it, so nothing else here takes a click. */
    isNew: boolean;
    isDragDisabled: boolean;
    /** A viewer's saved section: chevron, name and count only. */
    isReadOnly: boolean;
    /** The roving tab stop of the list: the chevron takes Tab only when it is the one. */
    isTabStop: boolean;
    onToggle: () => void;
    onRename: () => void;
    onCommitName: (name: string) => void;
    onCancelName: () => void;
    /** A new filter in this section. */
    onAddFilter: () => void;
    /** Flips the saved default, `section.collapsed`; this rail's fold stays. */
    onToggleCollapsedByDefault: () => void;
    onRemove: () => void;
};

// A filled band over its rows: grip, chevron, name, count and the menu
export const SectionHeader: FC<Props> = ({
    section,
    countLabel,
    selectedLabel,
    isCollapsed,
    isEditingName,
    isNew,
    isDragDisabled,
    isReadOnly,
    isTabStop,
    onToggle,
    onRename,
    onCommitName,
    onCancelName,
    onAddFilter,
    onToggleCollapsedByDefault,
    onRemove,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
    } = useSortable({ id: section.id, disabled: isDragDisabled });
    const getUiString = useUiStrings();
    const name = section.name || getUiString('filters.rail.untitledSection');
    // "Remove section" asks twice; the menu stays open in between
    const [isRemoveArmed, setIsRemoveArmed] = useState(false);
    return (
        <Box
            ref={setNodeRef}
            className={classes.sectionHeader}
            data-dragging={isDragging || undefined}
            data-over={(isOver && !isDragging) || undefined}
            data-controls-section={section.id}
            style={{ transform: CSS.Translate.toString(transform), transition }}
        >
            <Box className={classes.sectionHeadRow}>
                {!isDragDisabled && !isReadOnly && (
                    <DragGrip
                        label={`Drag to reorder section ${name}`}
                        attributes={attributes}
                        listeners={listeners}
                    />
                )}
                <ActionIcon
                    variant="subtle"
                    size="sm"
                    aria-label={interpolateUiString(
                        getUiString(
                            isCollapsed
                                ? 'filters.rail.expandSection'
                                : 'filters.rail.collapseSection',
                        ),
                        { section: name },
                    )}
                    aria-expanded={!isCollapsed}
                    disabled={isNew}
                    tabIndex={isTabStop ? 0 : -1}
                    data-controls-stop={`section:${section.id}`}
                    onClick={onToggle}
                >
                    <MantineIcon
                        icon={IconChevronRight}
                        size={14}
                        className={classes.chevron}
                    />
                </ActionIcon>
                {isEditingName && !isReadOnly ? (
                    <SectionNameInput
                        name={section.name}
                        onCommit={onCommitName}
                        onCancel={onCancelName}
                    />
                ) : (
                    <Text fz="sm" fw={600} truncate miw={0}>
                        {name}
                    </Text>
                )}
                <Text
                    fz="xs"
                    c="dimmed"
                    flex="0 0 auto"
                    className={classes.sectionCount}
                >
                    {countLabel}
                </Text>
                {selectedLabel !== null && (
                    <Text
                        fz="xs"
                        c="dimmed"
                        flex="0 0 auto"
                        className={classes.sectionCount}
                    >
                        {selectedLabel}
                    </Text>
                )}
                {/* Focus must stay on the name input Rename opens */}
                {!isReadOnly && !isNew && (
                    <Menu
                        position="bottom-end"
                        returnFocus={false}
                        onClose={() => setIsRemoveArmed(false)}
                    >
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
                            <Menu.Item
                                fz="xs"
                                leftSection={
                                    <MantineIcon
                                        icon={IconFilterPlus}
                                        size={14}
                                    />
                                }
                                onClick={onAddFilter}
                            >
                                Add filter
                            </Menu.Item>
                            <Menu.Item
                                fz="xs"
                                leftSection={
                                    <MantineIcon icon={IconPencil} size={14} />
                                }
                                onClick={onRename}
                            >
                                Rename
                            </Menu.Item>
                            {/* A checkbox item, as the date zoom menu: the
                                item and the box both toggle, the menu stays
                                so the change shows */}
                            <Menu.Item
                                fz="xs"
                                closeMenuOnClick={false}
                                leftSection={
                                    <Checkbox
                                        size="xs"
                                        checked={section.collapsed === true}
                                        onChange={onToggleCollapsedByDefault}
                                        onClick={(event) =>
                                            event.stopPropagation()
                                        }
                                    />
                                }
                                onClick={onToggleCollapsedByDefault}
                            >
                                Collapsed by default
                            </Menu.Item>
                            <Menu.Item
                                fz="xs"
                                color="red"
                                leftSection={
                                    <MantineIcon icon={IconTrash} size={14} />
                                }
                                closeMenuOnClick={isRemoveArmed}
                                aria-pressed={isRemoveArmed}
                                onClick={() => {
                                    if (isRemoveArmed) onRemove();
                                    else setIsRemoveArmed(true);
                                }}
                            >
                                {isRemoveArmed
                                    ? `Remove section · ${countLabel}`
                                    : 'Remove section'}
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                )}
            </Box>
        </Box>
    );
};
