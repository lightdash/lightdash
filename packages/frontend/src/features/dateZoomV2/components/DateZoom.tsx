import { DateGranularity } from '@lightdash/common';
import { ActionIcon, Box, Button, Group, Menu } from '@mantine-8/core';
import {
    IconCalendarSearch,
    IconCheck,
    IconChevronDown,
    IconChevronUp,
    IconX,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
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
    const { track } = useTracking();

    useEffect(() => {
        if (isEditMode) setDateZoomGranularity(undefined);
    }, [isEditMode, setDateZoomGranularity]);

    if (isDateZoomDisabled) {
        if (isEditMode)
            return (
                <Button
                    variant="outline"
                    size="xs"
                    leftSection={<MantineIcon icon={IconCalendarSearch} />}
                    onClick={() => setIsDateZoomDisabled(false)}
                    classNames={{ root: styles.addDateZoomButton }}
                >
                    + Add date zoom
                </Button>
            );
        return null;
    }

    return (
        <Menu
            withinPortal
            withArrow
            closeOnItemClick
            closeOnClickOutside
            offset={-1}
            position="bottom-end"
            disabled={isEditMode}
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
                        disabled={isEditMode}
                        classNames={
                            dateZoomGranularity
                                ? { root: styles.activeDateZoomButton }
                                : undefined
                        }
                        leftSection={<MantineIcon icon={IconCalendarSearch} />}
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
                        Date Zoom
                        {dateZoomGranularity ? `:` : null}{' '}
                        {dateZoomGranularity ? (
                            <Box fw={500} ml="xxs">
                                {dateZoomGranularity}
                            </Box>
                        ) : null}
                    </Button>
                </Group>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label fz={10}>Granularity</Menu.Label>
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
                    className={
                        dateZoomGranularity === undefined
                            ? styles.menuItemDisabled
                            : ''
                    }
                    rightSection={
                        dateZoomGranularity === undefined ? (
                            <MantineIcon icon={IconCheck} size={14} />
                        ) : null
                    }
                >
                    Default
                </Menu.Item>
                {Object.values(DateGranularity).map((granularity) => (
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
                        className={
                            dateZoomGranularity === granularity
                                ? styles.menuItemDisabled
                                : ''
                        }
                        rightSection={
                            dateZoomGranularity === granularity ? (
                                <MantineIcon icon={IconCheck} size={14} />
                            ) : null
                        }
                    >
                        {granularity}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
};
