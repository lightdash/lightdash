import { DateGranularity } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Checkbox,
    Group,
    Menu,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconCheck,
    IconChevronDown,
    IconChevronUp,
    IconPin,
    IconPinFilled,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import styles from './DateZoom.module.css';

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
    const { track } = useTracking();

    useEffect(() => {
        if (isEditMode) setDateZoomGranularity(undefined);
    }, [isEditMode, setDateZoomGranularity]);

    const handleToggleGranularity = useCallback(
        (granularity: DateGranularity) => {
            const isEnabled = dateZoomGranularities.includes(granularity);
            if (isEnabled && dateZoomGranularities.length <= 1) {
                return; // Must keep at least one granularity
            }

            const newGranularities = isEnabled
                ? dateZoomGranularities.filter((g) => g !== granularity)
                : [...dateZoomGranularities, granularity];

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
        (granularity: DateGranularity) => {
            setDefaultDateZoomGranularity(
                defaultDateZoomGranularity === granularity
                    ? undefined
                    : granularity,
            );
        },
        [defaultDateZoomGranularity, setDefaultDateZoomGranularity],
    );

    if (isDateZoomDisabled) {
        if (isEditMode)
            return (
                <Button
                    variant="light"
                    size="xs"
                    onClick={() => setIsDateZoomDisabled(false)}
                >
                    Add Date Zoom
                </Button>
            );
        return null;
    }

    return (
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
                <Group gap={0} pos="relative">
                    {isEditMode && (
                        <ActionIcon
                            size="xs"
                            variant="default"
                            onClick={() => setIsDateZoomDisabled(true)}
                            className={styles.closeButton}
                        >
                            <MantineIcon icon={IconX} size={12} />
                        </ActionIcon>
                    )}
                    <Button
                        size="xs"
                        variant="default"
                        classNames={
                            !isEditMode && dateZoomGranularity
                                ? { root: styles.activeDateZoomButton }
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
                                    {dateZoomGranularity}
                                </Text>
                            </>
                        ) : null}
                    </Button>
                </Group>
            </Menu.Target>
            <Menu.Dropdown>
                {isEditMode ? (
                    <>
                        <Menu.Label>Granularities</Menu.Label>
                        {Object.values(DateGranularity).map((granularity) => {
                            const isEnabled =
                                dateZoomGranularities.includes(granularity);
                            const isDefault =
                                defaultDateZoomGranularity === granularity;
                            const isLastEnabled =
                                isEnabled && dateZoomGranularities.length <= 1;

                            return (
                                <Menu.Item
                                    fz="xs"
                                    key={granularity}
                                    closeMenuOnClick={false}
                                    leftSection={
                                        <Checkbox
                                            size="xs"
                                            checked={isEnabled}
                                            disabled={isLastEnabled}
                                            onChange={() =>
                                                handleToggleGranularity(
                                                    granularity,
                                                )
                                            }
                                            styles={{
                                                input: { cursor: 'pointer' },
                                            }}
                                        />
                                    }
                                    rightSection={
                                        isEnabled ? (
                                            <Tooltip
                                                label={
                                                    isDefault
                                                        ? 'Remove default'
                                                        : 'Set as default'
                                                }
                                                position="top"
                                            >
                                                <ActionIcon
                                                    size="xs"
                                                    variant="subtle"
                                                    color={
                                                        isDefault
                                                            ? 'blue'
                                                            : 'gray'
                                                    }
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSetDefault(
                                                            granularity,
                                                        );
                                                    }}
                                                >
                                                    <MantineIcon
                                                        icon={
                                                            isDefault
                                                                ? IconPinFilled
                                                                : IconPin
                                                        }
                                                        size="sm"
                                                    />
                                                </ActionIcon>
                                            </Tooltip>
                                        ) : null
                                    }
                                    onClick={() =>
                                        handleToggleGranularity(granularity)
                                    }
                                >
                                    {granularity}
                                </Menu.Item>
                            );
                        })}
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

                        {dateZoomGranularities.map((granularity) => (
                            <Menu.Item
                                fz="xs"
                                key={granularity}
                                onClick={() => {
                                    track({
                                        name: EventName.DATE_ZOOM_CLICKED,
                                        properties: {
                                            granularity,
                                        },
                                    });
                                    setDateZoomGranularity(granularity);
                                }}
                                disabled={dateZoomGranularity === granularity}
                                rightSection={
                                    dateZoomGranularity === granularity ? (
                                        <MantineIcon
                                            icon={IconCheck}
                                            size={14}
                                        />
                                    ) : null
                                }
                            >
                                {granularity}
                            </Menu.Item>
                        ))}
                    </>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};
