import { useDroppable } from '@dnd-kit/core';
import { type DashboardControlSection } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Menu,
    Paper,
    Stack,
    Switch,
    Text,
    Title,
    Tooltip,
    VisuallyHidden,
} from '@mantine/core';
import {
    IconFilterPlus,
    IconFolderPlus,
    IconListCheck,
    IconPlus,
    IconX,
} from '@tabler/icons-react';
import { useRef, type FC, type ReactNode } from 'react';
import { ConfirmDeleteButton } from '../../components/common/ConfirmDeleteButton';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import classes from './ControlSidebar.module.css';
import { useRailContractClasses } from './railContractClasses';
import { RAIL_ADD_SELECTOR } from './railSelectors';
import { UNSECTIONED_TARGET_ID } from './sections';
import { useRailTop } from './useRailTop';

export type SelectMode = {
    count: number;
    /** Each section with how many filters it holds. */
    sections: (DashboardControlSection & { count: number })[];
    onExit: () => void;
    /** Null takes the selected filters out of their sections. */
    onMove: (sectionId: string | null) => void;
    /** Names a new section, then moves the selection into it. */
    onMoveToNewSection: () => void;
    onRemove: () => void;
};

type Props = {
    /** The dashboard's filters, listed in the rail. */
    filterCount: number;
    onClose: () => void;
    /** While a section header is dragged: it cannot leave a section. */
    isUnsectionTargetDisabled: boolean;
    /** A row or header is dragged: Escape cancels the drag, not the rail. */
    isDragging: boolean;
    /** Set while the filter cannot be kept: the footer offers only this. */
    onCancel: (() => void) | null;
    /** Null while no filter can be added. */
    onAddFilter: (() => void) | null;
    /** Null for a viewer, whose rail has no sections. */
    onNewSection: (() => void) | null;
    /**
     * Editors only. `disabledReason` while a new filter has no field yet:
     * the item stays, disabled, with the reason as its tooltip.
     */
    selectFilters: {
        onSelect: () => void;
        disabledReason: string | null;
    } | null;
    /** Editors only: while filters are being selected. */
    selectMode: SelectMode | null;
    footerStatus: string | null;
    /** Editors only: whether viewers may add their own filters, and its setter. */
    viewerAdd: {
        isEnabled: boolean;
        onChange: (isEnabled: boolean) => void;
    } | null;
    children: ReactNode;
};

const selectedLabel = (count: number) => `${count} selected`;

// The rail: a card next to the grid, stuck under the tabs and filter bar
export const EditorShell: FC<Props> = ({
    filterCount,
    onClose,
    isUnsectionTargetDisabled,
    isDragging,
    onCancel,
    onAddFilter,
    onNewSection,
    selectFilters,
    selectMode,
    footerStatus,
    viewerAdd,
    children,
}) => {
    const ref = useRef<HTMLDivElement>(null);
    useRailTop(ref);
    const getUiString = useUiStrings();
    const contractClasses = useRailContractClasses();
    // A row dropped on the header leaves its section
    const { setNodeRef: setDropRef, isOver } = useDroppable({
        id: UNSECTIONED_TARGET_ID,
        disabled: isUnsectionTargetDisabled,
    });
    // Escape leaves the menu with nothing focused; the name input and the
    // new filter's editor take focus before this runs
    const refocusAdd = () =>
        setTimeout(() => {
            if (document.activeElement !== document.body) return;
            document.querySelector<HTMLElement>(RAIL_ADD_SELECTOR)?.focus();
        });
    const selectItem = selectFilters && (
        <Menu.Item
            fz="xs"
            leftSection={<MantineIcon icon={IconListCheck} size={14} />}
            disabled={selectFilters.disabledReason !== null}
            onClick={selectFilters.onSelect}
        >
            Select filters
        </Menu.Item>
    );
    return (
        <Paper
            ref={ref}
            className={
                contractClasses
                    ? `${contractClasses.rail} ${classes.root}`
                    : classes.root
            }
            data-controls-editor
            data-controls-dragging={isDragging || undefined}
            // Escape leaves select mode, not the rail; a menu and an armed
            // remove keep their own
            data-own-escape={selectMode !== null || undefined}
            onKeyDown={(event) => {
                if (selectMode === null || event.key !== 'Escape') return;
                if (
                    event.target instanceof Element &&
                    event.target.closest('[role="menu"], [data-own-escape]') !==
                        event.currentTarget
                )
                    return;
                event.preventDefault();
                selectMode.onExit();
            }}
        >
            <Group
                ref={setDropRef}
                justify="space-between"
                wrap="nowrap"
                px="md"
                py="xs"
                className={classes.header}
                data-over={isOver || undefined}
            >
                <Group gap="xs" wrap="nowrap">
                    <Title order={5}>{getUiString('filters.rail.title')}</Title>
                    {selectMode ? (
                        <Badge size="sm">
                            {selectedLabel(selectMode.count)}
                        </Badge>
                    ) : (
                        filterCount > 0 && (
                            <Badge size="sm">
                                {filterCount}
                                <VisuallyHidden>
                                    {` ${getUiString(
                                        filterCount === 1
                                            ? 'filters.summary.filterSingular'
                                            : 'filters.summary.filterPlural',
                                    )}`}
                                </VisuallyHidden>
                            </Badge>
                        )
                    )}
                </Group>
                <Group gap={4} wrap="nowrap">
                    {/* Focus must stay on the name input New section opens */}
                    {(onAddFilter || onNewSection) && (
                        <Menu
                            position="bottom-end"
                            returnFocus={false}
                            onClose={refocusAdd}
                        >
                            <Menu.Target>
                                <Tooltip
                                    label={getUiString('filters.rail.add')}
                                >
                                    <ActionIcon
                                        size="sm"
                                        variant="subtle"
                                        color="gray"
                                        aria-label={getUiString(
                                            'filters.rail.add',
                                        )}
                                        data-controls-new-section
                                    >
                                        <MantineIcon icon={IconPlus} />
                                    </ActionIcon>
                                </Tooltip>
                            </Menu.Target>
                            <Menu.Dropdown>
                                {onAddFilter && (
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
                                        {getUiString('filters.addFilter')}
                                    </Menu.Item>
                                )}
                                {onNewSection && (
                                    <Menu.Item
                                        fz="xs"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconFolderPlus}
                                                size={14}
                                            />
                                        }
                                        onClick={onNewSection}
                                    >
                                        New section
                                    </Menu.Item>
                                )}
                                {selectFilters && <Menu.Divider />}
                                {/* A disabled item takes no pointer: the
                                    box around it carries the tooltip */}
                                {selectFilters?.disabledReason ? (
                                    <Tooltip
                                        label={selectFilters.disabledReason}
                                        position="left"
                                    >
                                        <Box>{selectItem}</Box>
                                    </Tooltip>
                                ) : (
                                    selectItem
                                )}
                            </Menu.Dropdown>
                        </Menu>
                    )}
                    <Tooltip
                        label={
                            selectMode
                                ? 'Stop selecting'
                                : getUiString('filters.rail.close')
                        }
                    >
                        <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="gray"
                            aria-label={
                                selectMode
                                    ? 'Stop selecting'
                                    : getUiString('filters.rail.close')
                            }
                            onClick={selectMode ? selectMode.onExit : onClose}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>

            <Box className={classes.body}>{children}</Box>

            <Stack gap="xs" p="sm" className={classes.footer}>
                {footerStatus !== null && !onCancel && !selectMode && (
                    <Text
                        key={footerStatus}
                        fz="xs"
                        c="dimmed"
                        className={classes.footerStatus}
                    >
                        {footerStatus}
                    </Text>
                )}
                <Group justify="space-between" gap="xs" wrap="nowrap">
                    {selectMode ? (
                        <>
                            <Button
                                variant="subtle"
                                color="gray"
                                size="xs"
                                mr="auto"
                                onClick={selectMode.onExit}
                            >
                                {getUiString('filters.actions.cancel')}
                            </Button>
                            {/* Focus must stay on the name input New section opens */}
                            <Menu position="top-end" returnFocus={false}>
                                <Menu.Target>
                                    <Button
                                        variant="subtle"
                                        color="gray"
                                        size="xs"
                                        flex="0 0 auto"
                                        disabled={selectMode.count === 0}
                                    >
                                        Move to
                                    </Button>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Item
                                        fz="xs"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconFolderPlus}
                                                size={14}
                                            />
                                        }
                                        onClick={selectMode.onMoveToNewSection}
                                    >
                                        New section
                                    </Menu.Item>
                                    <Menu.Divider />
                                    {selectMode.sections.map((section) => (
                                        <Menu.Item
                                            key={section.id}
                                            fz="xs"
                                            onClick={() =>
                                                selectMode.onMove(section.id)
                                            }
                                        >
                                            {section.name ||
                                                getUiString(
                                                    'filters.rail.untitledSection',
                                                )}
                                            <Text span inherit c="dimmed">
                                                {` · ${section.count}`}
                                            </Text>
                                        </Menu.Item>
                                    ))}
                                    {selectMode.sections.length > 0 && (
                                        <Menu.Divider />
                                    )}
                                    <Menu.Item
                                        fz="xs"
                                        onClick={() => selectMode.onMove(null)}
                                    >
                                        No section
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                            <ConfirmDeleteButton
                                size="sm"
                                w="auto"
                                px="xs"
                                fz="xs"
                                data-own-escape
                                aria-label="Remove"
                                tooltip={`Click again to remove ${selectMode.count} ${
                                    selectMode.count === 1
                                        ? 'filter'
                                        : 'filters'
                                }`}
                                disabled={selectMode.count === 0}
                                onConfirm={selectMode.onRemove}
                            >
                                Remove
                            </ConfirmDeleteButton>
                        </>
                    ) : onCancel ? (
                        <>
                            <Text
                                key={footerStatus}
                                fz="xs"
                                c="dimmed"
                                className={classes.footerStatus}
                            >
                                {footerStatus}
                            </Text>
                            <Button
                                variant="subtle"
                                color="gray"
                                size="xs"
                                flex="0 0 auto"
                                onClick={onCancel}
                            >
                                {getUiString('filters.actions.cancel')}
                            </Button>
                        </>
                    ) : (
                        <>
                            {viewerAdd && (
                                <Switch
                                    size="xs"
                                    label="Viewers can add filters"
                                    classNames={{
                                        label: classes.footerSwitchLabel,
                                    }}
                                    checked={viewerAdd.isEnabled}
                                    onChange={(event) =>
                                        viewerAdd.onChange(
                                            event.currentTarget.checked,
                                        )
                                    }
                                />
                            )}
                            <Button
                                size="xs"
                                ml="auto"
                                className={classes.done}
                                onClick={onClose}
                            >
                                {getUiString('filters.rail.done')}
                            </Button>
                        </>
                    )}
                </Group>
            </Stack>
        </Paper>
    );
};
