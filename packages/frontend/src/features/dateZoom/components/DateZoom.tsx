import { DateGranularity } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Text,
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
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useTracking from '../../../providers/Tracking/useTracking';
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
                    variant="outline"
                    size="xs"
                    leftIcon={<MantineIcon icon={IconCalendarSearch} />}
                    onClick={() => setIsDateZoomDisabled(false)}
                    sx={(themeStyles) => ({
                        borderStyle: 'dashed',
                        borderWidth: '1px',
                        borderColor: themeStyles.colors.gray[4],
                    })}
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
                <Group spacing={0} sx={{ position: 'relative' }}>
                    {isEditMode && (
                        <ActionIcon
                            size="xs"
                            variant="subtle"
                            onClick={() => setIsDateZoomDisabled(true)}
                            sx={(themeStyles) => ({
                                position: 'absolute',
                                top: -6,
                                left: -6,
                                zIndex: 1,
                                backgroundColor: themeStyles.white,
                            })}
                        >
                            <MantineIcon icon={IconX} size={12} />
                        </ActionIcon>
                    )}
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
