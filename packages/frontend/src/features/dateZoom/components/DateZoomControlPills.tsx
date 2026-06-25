import {
    DateGranularity,
    getControlActiveGranularity,
    isStandardDateGranularity,
    pruneDateZoomConfig,
    type DateZoomConfig,
    type DateZoomControl,
} from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Group,
    Menu,
    Popover,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconChevronDown,
    IconEye,
    IconEyeOff,
    IconSettings,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { v4 as uuid4 } from 'uuid';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';
import { getGranularityLabel } from '../utils';
import styles from './DateZoom.module.css';
import { DateZoomControlConfig } from './DateZoomControlConfig';

type Props = {
    isEditMode: boolean;
};

export const DateZoomControlPills: FC<Props> = ({ isEditMode }) => {
    const dateZoomConfig = useDashboardContext((c) => c.dateZoomConfig);
    const setDateZoomConfig = useDashboardContext((c) => c.setDateZoomConfig);
    const controlGranularities = useDashboardContext(
        (c) => c.controlGranularities,
    );
    const setControlGranularity = useDashboardContext(
        (c) => c.setControlGranularity,
    );
    const availableCustomGranularities = useDashboardTileStatusContext(
        (c) => c.availableCustomGranularities,
    );
    const dateZoomGranularities = useDashboardContext(
        (c) => c.dateZoomGranularities,
    );
    const defaultDateZoomGranularity = useDashboardContext(
        (c) => c.defaultDateZoomGranularity,
    );

    // A control offers only the dashboard's enabled granularities, split into
    // standard and custom (customs sorted by label).
    const standardGranularities = useMemo(
        () => dateZoomGranularities.filter(isStandardDateGranularity),
        [dateZoomGranularities],
    );
    const customGranularities = useMemo(
        () =>
            dateZoomGranularities
                .filter((g) => !isStandardDateGranularity(g))
                .sort((a, b) =>
                    getGranularityLabel(
                        a,
                        availableCustomGranularities,
                    ).localeCompare(
                        getGranularityLabel(b, availableCustomGranularities),
                    ),
                ),
        [dateZoomGranularities, availableCustomGranularities],
    );

    const [editingControl, setEditingControl] = useState<DateZoomControl>();
    // Inner Select dropdowns portal outside the config popover; track them so a
    // click on one doesn't dismiss the popover.
    const [isSubPopoverOpen, { open: openSubPopover, close: closeSubPopover }] =
        useDisclosure();

    // A draft whose uuid isn't in the saved config yet is a brand-new control
    // being added (anchors the popover to the "Add date zoom" button).
    const isAddingNew =
        !!editingControl &&
        !dateZoomConfig.controls.some((c) => c.uuid === editingControl.uuid);

    const handleSave = (nextConfig: DateZoomConfig) => {
        setDateZoomConfig(nextConfig);
        setEditingControl(undefined);
    };

    const handleDelete = (controlUuid: string) => {
        setDateZoomConfig(
            pruneDateZoomConfig({
                ...dateZoomConfig,
                controls: dateZoomConfig.controls.filter(
                    (c) => c.uuid !== controlUuid,
                ),
            }),
        );
        setEditingControl(undefined);
    };

    const handleToggleHidden = (control: DateZoomControl) => {
        setDateZoomConfig({
            ...dateZoomConfig,
            controls: dateZoomConfig.controls.map((c) =>
                c.uuid === control.uuid ? { ...c, hidden: !c.hidden } : c,
            ),
        });
    };

    const visibleControls = dateZoomConfig.controls.filter(
        (control) => isEditMode || !control.hidden,
    );

    // Controls sit at the right edge of the toolbar, so anchor the popover's
    // right edge to the trigger (bottom-end) — bottom-start would overflow the
    // viewport and get shifted left, away from the clicked pill.
    const closeConfig = () => setEditingControl(undefined);
    const popoverProps = {
        position: 'bottom-end',
        withArrow: true,
        withinPortal: true,
        trapFocus: true,
        shadow: 'md',
        offset: 1,
        arrowOffset: 14,
        closeOnEscape: !isSubPopoverOpen,
        closeOnClickOutside: !isSubPopoverOpen,
        onClose: closeConfig,
        // For a controlled popover, Mantine fires onDismiss (not onClose) on
        // outside-click/escape — without it the popover can't be dismissed.
        onDismiss: !isSubPopoverOpen ? closeConfig : undefined,
    } as const;

    return (
        <Group gap="xs" wrap="nowrap">
            {visibleControls.map((control) => {
                const activeGranularity = getControlActiveGranularity(
                    control,
                    controlGranularities,
                );
                const isEditing = editingControl?.uuid === control.uuid;
                return (
                    <Group key={control.uuid} gap={0} wrap="nowrap">
                        <Popover opened={isEditing} {...popoverProps}>
                            <Popover.Target>
                                <Box>
                                    <Menu
                                        withinPortal
                                        withArrow
                                        position="bottom-end"
                                        offset={1}
                                        arrowOffset={14}
                                        closeOnItemClick
                                        disabled={isEditing}
                                    >
                                        <Menu.Target>
                                            <Button
                                                size="xs"
                                                variant="default"
                                                classNames={{
                                                    root: isEditMode
                                                        ? styles.segmentStart
                                                        : styles.pill,
                                                }}
                                                rightSection={
                                                    <MantineIcon
                                                        icon={IconChevronDown}
                                                    />
                                                }
                                            >
                                                {control.name} ·{' '}
                                                {getGranularityLabel(
                                                    activeGranularity,
                                                    availableCustomGranularities,
                                                )}
                                            </Button>
                                        </Menu.Target>
                                        <Menu.Dropdown>
                                            <Menu.Label>Granularity</Menu.Label>
                                            {standardGranularities.map(
                                                (granularity) => (
                                                    <Menu.Item
                                                        key={granularity}
                                                        fz="xs"
                                                        disabled={
                                                            activeGranularity ===
                                                            granularity
                                                        }
                                                        onClick={() =>
                                                            setControlGranularity(
                                                                control.uuid,
                                                                granularity,
                                                            )
                                                        }
                                                    >
                                                        {granularity}
                                                    </Menu.Item>
                                                ),
                                            )}
                                            {customGranularities.length > 0 && (
                                                <>
                                                    <Menu.Divider />
                                                    <Menu.Label>
                                                        Custom
                                                    </Menu.Label>
                                                    {customGranularities.map(
                                                        (granularity) => (
                                                            <Menu.Item
                                                                key={
                                                                    granularity
                                                                }
                                                                fz="xs"
                                                                disabled={
                                                                    activeGranularity ===
                                                                    granularity
                                                                }
                                                                onClick={() =>
                                                                    setControlGranularity(
                                                                        control.uuid,
                                                                        granularity,
                                                                    )
                                                                }
                                                            >
                                                                {getGranularityLabel(
                                                                    granularity,
                                                                    availableCustomGranularities,
                                                                )}
                                                            </Menu.Item>
                                                        ),
                                                    )}
                                                </>
                                            )}
                                            <Menu.Divider />
                                            <Menu.Item
                                                fz="xs"
                                                onClick={() =>
                                                    setControlGranularity(
                                                        control.uuid,
                                                        undefined,
                                                    )
                                                }
                                            >
                                                Reset to default
                                            </Menu.Item>
                                            {isEditMode && (
                                                <>
                                                    <Menu.Item
                                                        fz="xs"
                                                        leftSection={
                                                            <MantineIcon
                                                                icon={
                                                                    IconSettings
                                                                }
                                                            />
                                                        }
                                                        onClick={() =>
                                                            setEditingControl(
                                                                control,
                                                            )
                                                        }
                                                    >
                                                        Configure
                                                    </Menu.Item>
                                                    <Menu.Item
                                                        fz="xs"
                                                        color="red"
                                                        leftSection={
                                                            <MantineIcon
                                                                icon={IconTrash}
                                                            />
                                                        }
                                                        onClick={() =>
                                                            handleDelete(
                                                                control.uuid,
                                                            )
                                                        }
                                                    >
                                                        Remove
                                                    </Menu.Item>
                                                </>
                                            )}
                                        </Menu.Dropdown>
                                    </Menu>
                                </Box>
                            </Popover.Target>
                            <Popover.Dropdown>
                                {isEditing && editingControl && (
                                    <DateZoomControlConfig
                                        control={editingControl}
                                        config={dateZoomConfig}
                                        onSave={handleSave}
                                        popoverProps={{
                                            onDropdownOpen: openSubPopover,
                                            onDropdownClose: closeSubPopover,
                                        }}
                                    />
                                )}
                            </Popover.Dropdown>
                        </Popover>

                        {isEditMode && (
                            <>
                                <Divider orientation="vertical" />

                                <Tooltip
                                    label={
                                        control.hidden
                                            ? 'Hidden from viewers. Click to show.'
                                            : 'Visible to viewers. Click to hide.'
                                    }
                                    withinPortal
                                >
                                    <Button
                                        aria-label="Toggle zoom control visibility for viewers"
                                        size="xs"
                                        variant="default"
                                        color="ldGray"
                                        onClick={() =>
                                            handleToggleHidden(control)
                                        }
                                        classNames={{
                                            root: styles.segmentEnd,
                                        }}
                                    >
                                        <MantineIcon
                                            icon={
                                                control.hidden
                                                    ? IconEyeOff
                                                    : IconEye
                                            }
                                        />
                                    </Button>
                                </Tooltip>
                            </>
                        )}
                    </Group>
                );
            })}

            {isEditMode && (
                <Popover opened={isAddingNew} {...popoverProps}>
                    <Popover.Target>
                        <Button
                            size="xs"
                            variant="default"
                            classNames={{ root: styles.addControl }}
                            onClick={() =>
                                setEditingControl({
                                    uuid: uuid4(),
                                    name: 'Date zoom',
                                    granularity:
                                        defaultDateZoomGranularity ??
                                        dateZoomGranularities[0] ??
                                        DateGranularity.MONTH,
                                })
                            }
                        >
                            Add date zoom
                        </Button>
                    </Popover.Target>
                    <Popover.Dropdown>
                        {isAddingNew && editingControl && (
                            <DateZoomControlConfig
                                key={editingControl.uuid}
                                control={editingControl}
                                config={dateZoomConfig}
                                onSave={handleSave}
                                popoverProps={{
                                    onDropdownOpen: openSubPopover,
                                    onDropdownClose: closeSubPopover,
                                }}
                            />
                        )}
                    </Popover.Dropdown>
                </Popover>
            )}
        </Group>
    );
};
