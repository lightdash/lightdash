import {
    DateGranularity,
    getTileControl,
    isStandardDateGranularity,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Checkbox,
    Group,
    Menu,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { clsx } from '@mantine/core';
import {
    IconCheck,
    IconChevronDown,
    IconChevronUp,
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
import { DateZoomControlPills } from './DateZoomControlPills';
import { DateZoomCrossTabFieldsLoader } from './DateZoomCrossTabFieldsLoader';

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
                        color={isDefault ? 'blue' : 'ldGray'}
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
    dropdownClassName?: string;
};

export const DateZoom: FC<Props> = ({ isEditMode, dropdownClassName }) => {
    const [showOpenIcon, setShowOpenIcon] = useState(false);

    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const setDateZoomGranularity = useDashboardContext(
        (c) => c.setDateZoomGranularity,
    );
    const isDateZoomDisabled = useDashboardContext((c) => c.isDateZoomDisabled);
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
    const { track } = useTracking();
    const dateZoomConfig = useDashboardContext((c) => c.dateZoomConfig);
    const chartZoomableFieldsByTileUuid = useDashboardContext(
        (c) => c.chartZoomableFieldsByTileUuid,
    );

    // Charts the Default governs: date-zoomable tiles not claimed by a control.
    const defaultTileCount = useMemo(
        () =>
            Object.entries(chartZoomableFieldsByTileUuid)
                .filter(([, fields]) => fields.length > 0)
                .filter(([uuid]) => !getTileControl(dateZoomConfig, uuid))
                .length,
        [chartZoomableFieldsByTileUuid, dateZoomConfig],
    );

    const isDefaultInert = defaultTileCount === 0;
    // Hide the inert Default from viewers; nothing falls through to it.
    const hideDefaultInView = !isEditMode && isDefaultInert;
    const defaultTooltip =
        defaultTileCount === 0
            ? 'No charts use the default (every chart is in a zoom control)'
            : `Applies to ${defaultTileCount} chart${
                  defaultTileCount === 1 ? '' : 's'
              } not in a zoom control`;

    useEffect(() => {
        if (isEditMode) setDateZoomGranularity(undefined);
    }, [isEditMode, setDateZoomGranularity]);

    // All standard granularities are offered to editors regardless of the
    // dashboard's dimensions; the editor's enabled list is what viewers see.
    const standardGranularities = useMemo(
        () => Object.values(DateGranularity),
        [],
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
        <Group gap="xs" wrap="nowrap">
            <Group
                gap="xs"
                wrap="nowrap"
                className={
                    isEditMode && isDateZoomDisabled
                        ? styles.hiddenFromViewers
                        : undefined
                }
            >
                {!hideDefaultInView && (
                    <Menu
                        withinPortal
                        withArrow
                        closeOnItemClick={!isEditMode}
                        closeOnClickOutside
                        offset={1}
                        arrowOffset={14}
                        position="bottom-end"
                        classNames={{ dropdown: dropdownClassName }}
                        onOpen={() => setShowOpenIcon(true)}
                        onClose={() => setShowOpenIcon(false)}
                    >
                        <Menu.Target>
                            <Tooltip
                                label={defaultTooltip}
                                disabled={!defaultTooltip}
                                withinPortal
                                position="bottom"
                            >
                                <Button
                                    size="xs"
                                    variant="default"
                                    classNames={{
                                        root: clsx(
                                            styles.pill,
                                            dateZoomGranularity &&
                                                styles.activeDateZoomButton,
                                        ),
                                    }}
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
                                    <Text fz="inherit" span>
                                        <Text
                                            span
                                            fz="inherit"
                                            fw={600}
                                            c={
                                                isDefaultInert
                                                    ? 'dimmed'
                                                    : undefined
                                            }
                                        >
                                            Default zoom
                                        </Text>
                                        {!isEditMode && dateZoomGranularity ? (
                                            <Text
                                                span
                                                fz="inherit"
                                                fw={500}
                                                c={
                                                    isDefaultInert
                                                        ? 'dimmed'
                                                        : undefined
                                                }
                                            >
                                                {` · ${getGranularityLabel(
                                                    dateZoomGranularity,
                                                    availableCustomGranularities,
                                                )}`}
                                            </Text>
                                        ) : null}
                                    </Text>
                                </Button>
                            </Tooltip>
                        </Menu.Target>
                        <Menu.Dropdown>
                            {isEditMode ? (
                                <>
                                    <Menu.Label>Granularities</Menu.Label>
                                    {standardGranularities.map(
                                        (granularity) => (
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
                                                    ) &&
                                                    dateZoomGranularities.length <=
                                                        1
                                                }
                                                onToggle={
                                                    handleToggleGranularity
                                                }
                                                onSetDefault={handleSetDefault}
                                            />
                                        ),
                                    )}
                                    {customGranularities.length > 0 && (
                                        <>
                                            <Menu.Divider />
                                            <Menu.Label>Custom</Menu.Label>
                                            {customGranularities.map(
                                                (granularity) => (
                                                    <EditModeGranularityItem
                                                        key={granularity}
                                                        granularity={
                                                            granularity
                                                        }
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
                                                        onToggle={
                                                            handleToggleGranularity
                                                        }
                                                        onSetDefault={
                                                            handleSetDefault
                                                        }
                                                    />
                                                ),
                                            )}
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

                                                setDateZoomGranularity(
                                                    undefined,
                                                );
                                            }}
                                            disabled={
                                                dateZoomGranularity ===
                                                undefined
                                            }
                                            rightSection={
                                                dateZoomGranularity ===
                                                undefined ? (
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
                                        .filter((g) =>
                                            isStandardDateGranularity(g),
                                        )
                                        .map((granularity) => (
                                            <ViewModeGranularityItem
                                                key={granularity}
                                                granularity={granularity}
                                                label={granularity}
                                                isActive={
                                                    dateZoomGranularity ===
                                                    granularity
                                                }
                                                onSelect={
                                                    handleSelectGranularity
                                                }
                                            />
                                        ))}

                                    {enabledCustomGranularities.length > 0 && (
                                        <>
                                            <Menu.Divider />
                                            {enabledCustomGranularities.map(
                                                (granularity) => (
                                                    <ViewModeGranularityItem
                                                        key={granularity}
                                                        granularity={
                                                            granularity
                                                        }
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
                )}
                <DateZoomControlPills isEditMode={isEditMode} />
            </Group>
            {isEditMode && <DateZoomCrossTabFieldsLoader />}
        </Group>
    );
};
