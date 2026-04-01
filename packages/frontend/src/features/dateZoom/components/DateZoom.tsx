import {
    DateGranularity,
    isStandardDateGranularity,
    isSubDayGranularity,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Checkbox,
    Divider,
    Group,
    Menu,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconCheck,
    IconChevronDown,
    IconChevronUp,
    IconEye,
    IconEyeOff,
    IconPin,
    IconPinFilled,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { getGranularityLabel } from '../utils';
import styles from './DateZoom.module.css';

type EditModeGranularityItemProps = {
    granularity: string;
    label: string;
    isEnabled: boolean;
    isDefault: boolean;
    isLastEnabled: boolean;
    onToggle: (granularity: DateGranularity | string) => void;
    onSetDefault: (granularity: DateGranularity | string) => void;
};

const EditModeGranularityItem: FC<EditModeGranularityItemProps> = ({
    granularity,
    label,
    isEnabled,
    isDefault,
    isLastEnabled,
    onToggle,
    onSetDefault,
}) => (
    <Menu.Item
        fz="xs"
        closeMenuOnClick={false}
        leftSection={
            <Checkbox
                size="xs"
                checked={isEnabled}
                disabled={isLastEnabled}
                onChange={() => onToggle(granularity)}
                classNames={{ input: styles.checkboxInput }}
            />
        }
        rightSection={
            isEnabled ? (
                <Tooltip
                    label={isDefault ? 'Remove default' : 'Set as default'}
                    position="top"
                >
                    <ActionIcon
                        size="xs"
                        variant="subtle"
                        color={isDefault ? 'blue' : 'gray'}
                        onClick={(e) => {
                            e.stopPropagation();
                            onSetDefault(granularity);
                        }}
                    >
                        <MantineIcon
                            icon={isDefault ? IconPinFilled : IconPin}
                            size="sm"
                        />
                    </ActionIcon>
                </Tooltip>
            ) : null
        }
        onClick={() => onToggle(granularity)}
    >
        {label}
    </Menu.Item>
);

type ViewModeGranularityItemProps = {
    granularity: string;
    label: string;
    isActive: boolean;
    onSelect: (granularity: DateGranularity | string) => void;
};

const ViewModeGranularityItem: FC<ViewModeGranularityItemProps> = ({
    granularity,
    label,
    isActive,
    onSelect,
}) => (
    <Menu.Item
        fz="xs"
        onClick={() => onSelect(granularity)}
        disabled={isActive}
        rightSection={
            isActive ? <MantineIcon icon={IconCheck} size={14} /> : null
        }
    >
        {label}
    </Menu.Item>
);

type Props = {
    isEditMode: boolean;
};

export const DateZoom: FC<Props> = ({ isEditMode }) => {
    const [showOpenIcon, setShowOpenIcon] = useState(false);

    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const setDateZoomGranularity = useDashboardContext(
        (c) => c.setDateZoomGranularity,
    );
    const isDateZoomDisabled = useDashboardContext((c) => c.isDateZoomDisabled);
    const setIsDateZoomDisabled = useDashboardContext(
        (c) => c.setIsDateZoomDisabled,
    );
    const dateZoomGranularities = useDashboardContext(
        (c) => c.dateZoomGranularities,
    );
    const setDateZoomGranularities = useDashboardContext(
        (c) => c.setDateZoomGranularities,
    );
    const defaultDateZoomGranularity = useDashboardContext(
        (c) => c.defaultDateZoomGranularity,
    );
    const setDefaultDateZoomGranularity = useDashboardContext(
        (c) => c.setDefaultDateZoomGranularity,
    );
    const availableCustomGranularities = useDashboardTileStatusContext(
        (c) => c.availableCustomGranularities,
    );
    const dashboardHasTimestampDimension = useDashboardTileStatusContext(
        (c) => c.dashboardHasTimestampDimension,
    );
    const { track } = useTracking();

    useEffect(() => {
        if (isEditMode) setDateZoomGranularity(undefined);
    }, [isEditMode, setDateZoomGranularity]);

    // Reset active sub-day granularity when no TIMESTAMP dimensions exist
    // (e.g., saved config or URL param on DATE-only dashboard)
    useEffect(() => {
        if (
            !dashboardHasTimestampDimension &&
            dateZoomGranularity &&
            isStandardDateGranularity(dateZoomGranularity) &&
            isSubDayGranularity(dateZoomGranularity)
        ) {
            setDateZoomGranularity(undefined);
        }
    }, [
        dashboardHasTimestampDimension,
        dateZoomGranularity,
        setDateZoomGranularity,
    ]);

    // Split available granularities into standard and custom for rendering with a divider.
    // Exclude sub-day granularities when no TIMESTAMP dimensions exist on the dashboard.
    const standardGranularities = useMemo(
        () =>
            dashboardHasTimestampDimension
                ? Object.values(DateGranularity)
                : Object.values(DateGranularity).filter(
                      (g) => !isSubDayGranularity(g),
                  ),
        [dashboardHasTimestampDimension],
    );

    const customGranularities = useMemo(
        () =>
            Object.keys(availableCustomGranularities).sort((a, b) => {
                const labelA = getGranularityLabel(
                    a,
                    availableCustomGranularities,
                );
                const labelB = getGranularityLabel(
                    b,
                    availableCustomGranularities,
                );
                return labelA.localeCompare(labelB);
            }),
        [availableCustomGranularities],
    );

    // View mode: enabled custom granularities, reusing the sorted order from customGranularities
    const enabledCustomGranularities = useMemo(
        () =>
            customGranularities.filter((g) =>
                dateZoomGranularities.includes(g),
            ),
        [customGranularities, dateZoomGranularities],
    );

    const handleToggleGranularity = useCallback(
        (granularity: DateGranularity | string) => {
            const isEnabled = dateZoomGranularities.includes(granularity);
            if (isEnabled && dateZoomGranularities.length <= 1) {
                return; // Must keep at least one granularity
            }

            const enabledSet = new Set(dateZoomGranularities);
            if (isEnabled) {
                enabledSet.delete(granularity);
            } else {
                enabledSet.add(granularity);
            }
            // Maintain canonical order: standard granularities first, then custom
            const standard = Object.values(DateGranularity).filter(
                (g): g is DateGranularity => enabledSet.has(g),
            );
            const custom = [...enabledSet].filter(
                (g) => !isStandardDateGranularity(g),
            );
            const newGranularities = [...standard, ...custom];

            setDateZoomGranularities(newGranularities);

            // If the default was removed, clear it
            if (
                defaultDateZoomGranularity === granularity &&
                !newGranularities.includes(granularity)
            ) {
                setDefaultDateZoomGranularity(undefined);
            }
        },
        [
            dateZoomGranularities,
            setDateZoomGranularities,
            defaultDateZoomGranularity,
            setDefaultDateZoomGranularity,
        ],
    );

    const handleSetDefault = useCallback(
        (granularity: DateGranularity | string) => {
            setDefaultDateZoomGranularity(
                defaultDateZoomGranularity === granularity
                    ? undefined
                    : granularity,
            );
        },
        [defaultDateZoomGranularity, setDefaultDateZoomGranularity],
    );

    const handleSelectGranularity = useCallback(
        (granularity: DateGranularity | string) => {
            track({
                name: EventName.DATE_ZOOM_CLICKED,
                properties: { granularity },
            });
            setDateZoomGranularity(granularity);
        },
        [track, setDateZoomGranularity],
    );

    if (isDateZoomDisabled && !isEditMode) {
        return null;
    }

    return (
        <Group gap={0} wrap="nowrap">
            <Menu
                withinPortal
                withArrow
                closeOnItemClick={!isEditMode}
                closeOnClickOutside
                offset={-1}
                position="bottom-end"
                onOpen={() => setShowOpenIcon(true)}
                onClose={() => setShowOpenIcon(false)}
            >
                <Menu.Target>
                    <Button
                        size="xs"
                        variant="default"
                        classNames={
                            !isEditMode && dateZoomGranularity
                                ? { root: styles.activeDateZoomButton }
                                : undefined
                        }
                        styles={
                            isEditMode
                                ? {
                                      root: {
                                          borderRightWidth: '0px',
                                          borderTopRightRadius: '0px',
                                          borderBottomRightRadius: '0px',
                                      },
                                  }
                                : undefined
                        }
                        rightSection={
                            <MantineIcon
                                icon={
                                    showOpenIcon
                                        ? IconChevronUp
                                        : IconChevronDown
                                }
                            />
                        }
                    >
                        <Text fz="inherit" fw={600}>
                            Date Zoom
                        </Text>
                        {!isEditMode && dateZoomGranularity ? (
                            <>
                                :{' '}
                                <Text fz="inherit" fw={500} ml="xxs">
                                    {getGranularityLabel(
                                        dateZoomGranularity,
                                        availableCustomGranularities,
                                    )}
                                </Text>
                            </>
                        ) : null}
                    </Button>
                </Menu.Target>
                <Menu.Dropdown>
                    {isEditMode ? (
                        <>
                            <Menu.Label>Granularities</Menu.Label>
                            {standardGranularities.map((granularity) => (
                                <EditModeGranularityItem
                                    key={granularity}
                                    granularity={granularity}
                                    label={granularity}
                                    isEnabled={dateZoomGranularities.includes(
                                        granularity,
                                    )}
                                    isDefault={
                                        defaultDateZoomGranularity ===
                                        granularity
                                    }
                                    isLastEnabled={
                                        dateZoomGranularities.includes(
                                            granularity,
                                        ) && dateZoomGranularities.length <= 1
                                    }
                                    onToggle={handleToggleGranularity}
                                    onSetDefault={handleSetDefault}
                                />
                            ))}
                            {customGranularities.length > 0 && (
                                <>
                                    <Menu.Divider />
                                    <Menu.Label>Custom</Menu.Label>
                                    {customGranularities.map((granularity) => (
                                        <EditModeGranularityItem
                                            key={granularity}
                                            granularity={granularity}
                                            label={getGranularityLabel(
                                                granularity,
                                                availableCustomGranularities,
                                            )}
                                            isEnabled={dateZoomGranularities.includes(
                                                granularity,
                                            )}
                                            isDefault={
                                                defaultDateZoomGranularity ===
                                                granularity
                                            }
                                            isLastEnabled={
                                                dateZoomGranularities.includes(
                                                    granularity,
                                                ) &&
                                                dateZoomGranularities.length <=
                                                    1
                                            }
                                            onToggle={handleToggleGranularity}
                                            onSetDefault={handleSetDefault}
                                        />
                                    ))}
                                </>
                            )}
                        </>
                    ) : (
                        <>
                            <Tooltip
                                label="Charts will display dates using their original granularity settings."
                                position="left"
                                multiline
                                maw={200}
                            >
                                <Menu.Item
                                    fz="xs"
                                    onClick={() => {
                                        track({
                                            name: EventName.DATE_ZOOM_CLICKED,
                                            properties: {
                                                granularity: 'default',
                                            },
                                        });

                                        setDateZoomGranularity(undefined);
                                    }}
                                    disabled={dateZoomGranularity === undefined}
                                    rightSection={
                                        dateZoomGranularity === undefined ? (
                                            <MantineIcon
                                                icon={IconCheck}
                                                size={14}
                                            />
                                        ) : null
                                    }
                                >
                                    None
                                </Menu.Item>
                            </Tooltip>

                            {dateZoomGranularities
                                .filter((g) => isStandardDateGranularity(g))
                                .map((granularity) => (
                                    <ViewModeGranularityItem
                                        key={granularity}
                                        granularity={granularity}
                                        label={granularity}
                                        isActive={
                                            dateZoomGranularity === granularity
                                        }
                                        onSelect={handleSelectGranularity}
                                    />
                                ))}

                            {enabledCustomGranularities.length > 0 && (
                                <>
                                    <Menu.Divider />
                                    {enabledCustomGranularities.map(
                                        (granularity) => (
                                            <ViewModeGranularityItem
                                                key={granularity}
                                                granularity={granularity}
                                                label={getGranularityLabel(
                                                    granularity,
                                                    availableCustomGranularities,
                                                )}
                                                isActive={
                                                    dateZoomGranularity ===
                                                    granularity
                                                }
                                                onSelect={
                                                    handleSelectGranularity
                                                }
                                            />
                                        ),
                                    )}
                                </>
                            )}
                        </>
                    )}
                </Menu.Dropdown>
            </Menu>

            {isEditMode && (
                <>
                    <Divider orientation="vertical" />

                    <Tooltip
                        label={
                            isDateZoomDisabled
                                ? 'Hidden from viewers. Click to show.'
                                : 'Visible to viewers. Click to hide.'
                        }
                        withinPortal
                    >
                        <Button
                            aria-label="Toggle date zoom visibility for viewers"
                            size="xs"
                            variant="default"
                            color="gray"
                            onClick={() =>
                                setIsDateZoomDisabled(!isDateZoomDisabled)
                            }
                            styles={{
                                root: {
                                    borderLeftWidth: '0px',
                                    borderStartStartRadius: '0px',
                                    borderEndStartRadius: '0px',
                                },
                            }}
                        >
                            <MantineIcon
                                icon={isDateZoomDisabled ? IconEyeOff : IconEye}
                            />
                        </Button>
                    </Tooltip>
                </>
            )}
        </Group>
    );
};
