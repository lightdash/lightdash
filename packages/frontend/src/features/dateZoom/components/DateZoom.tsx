import { DateGranularity } from '@lightdash/common';
import {
    Button,
    Group,
    Menu,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import {
    IconCalendarSearch,
    IconChevronDown,
    IconChevronUp,
    IconX,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';

type Props = {
    isEditMode: boolean;
};

export const DateZoom: FC<Props> = ({ isEditMode }) => {
    const theme = useMantineTheme();
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
                    variant="default"
                    size="xs"
                    leftIcon={<MantineIcon icon={IconCalendarSearch} />}
                    onClick={() => setIsDateZoomDisabled(false)}
                >
                    Enable Date Zoom
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
                <Group spacing={0}>
                    <Button
                        size="xs"
                        variant="default"
                        loaderPosition="center"
                        disabled={isEditMode}
                        sx={{
                            borderColor: dateZoomGranularity
                                ? theme.colors.blue['6']
                                : 'default',
                        }}
                        leftIcon={<MantineIcon icon={IconCalendarSearch} />}
                        rightIcon={
                            <MantineIcon
                                icon={
                                    showOpenIcon
                                        ? IconChevronUp
                                        : IconChevronDown
                                }
                            />
                        }
                    >
                        <Text>
                            Date Zoom
                            {dateZoomGranularity ? `:` : null}{' '}
                            {dateZoomGranularity ? (
                                <Text span fw={500}>
                                    {dateZoomGranularity}
                                </Text>
                            ) : null}
                        </Text>
                    </Button>
                    {isEditMode && (
                        <Tooltip
                            label="Disable date zoom on view mode"
                            position="left"
                        >
                            <Button
                                variant="default"
                                size="xs"
                                p={'xs'}
                                onClick={() => setIsDateZoomDisabled(true)}
                            >
                                <MantineIcon size={12} icon={IconX} />
                            </Button>
                        </Tooltip>
                    )}
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
                    bg={
                        dateZoomGranularity === undefined
                            ? theme.colors.blue['6']
                            : 'white'
                    }
                    disabled={dateZoomGranularity === undefined}
                    sx={{
                        '&[disabled]': {
                            color:
                                dateZoomGranularity === undefined
                                    ? 'white'
                                    : 'black',
                        },
                    }}
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
                        bg={
                            dateZoomGranularity === granularity
                                ? theme.colors.blue['6']
                                : 'white'
                        }
                        sx={{
                            '&[disabled]': {
                                color:
                                    dateZoomGranularity === granularity
                                        ? 'white'
                                        : 'black',
                            },
                        }}
                    >
                        {granularity}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
};
