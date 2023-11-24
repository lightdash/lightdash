import { Button, Menu, Text, useMantineTheme } from '@mantine/core';
import {
    IconCalendarSearch,
    IconChevronDown,
    IconChevronUp,
} from '@tabler/icons-react';
import { FC, useEffect, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { DATE_ZOOM_OPTIONS } from '../constants';

type Props = {
    isEditMode: boolean;
};

export const DateZoom: FC<Props> = ({ isEditMode }) => {
    const theme = useMantineTheme();
    const [isOpen, setIsOpen] = useState(false);
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const setDateZoomGranularity = useDashboardContext(
        (c) => c.setDateZoomGranularity,
    );

    useEffect(() => {
        if (isEditMode) setDateZoomGranularity(undefined);
    }, [isEditMode, setDateZoomGranularity]);

    return (
        <Menu
            withinPortal
            withArrow
            closeOnItemClick
            closeOnClickOutside
            opened={isOpen}
            offset={-1}
            position="bottom-end"
            disabled={isEditMode}
        >
            <Menu.Target>
                <Button
                    size="xs"
                    variant="default"
                    loaderPosition="center"
                    disabled={isEditMode}
                    onClick={() => {
                        setIsOpen((prev) => !prev);
                    }}
                    sx={{
                        borderColor: dateZoomGranularity
                            ? theme.colors.blue['6']
                            : 'default',
                    }}
                    leftIcon={<MantineIcon icon={IconCalendarSearch} />}
                    rightIcon={
                        <MantineIcon
                            icon={isOpen ? IconChevronUp : IconChevronDown}
                        />
                    }
                >
                    <Text>
                        Date Zoom
                        {dateZoomGranularity ? `:` : null}{' '}
                        {dateZoomGranularity ? (
                            <Text span fw={500}>
                                {dateZoomGranularity.label}
                            </Text>
                        ) : null}
                    </Text>
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label fz={10}>Granularity</Menu.Label>
                <Menu.Item
                    fz="xs"
                    onClick={() => {
                        setDateZoomGranularity(undefined);
                        setIsOpen(false);
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
                {DATE_ZOOM_OPTIONS.map(({ value, label }) => (
                    <Menu.Item
                        fz="xs"
                        key={value}
                        onClick={() => {
                            setDateZoomGranularity({ value, label });
                            setIsOpen(false);
                        }}
                        disabled={dateZoomGranularity?.value === value}
                        bg={
                            dateZoomGranularity?.value === value
                                ? theme.colors.blue['6']
                                : 'white'
                        }
                        sx={{
                            '&[disabled]': {
                                color:
                                    dateZoomGranularity?.value === value
                                        ? 'white'
                                        : 'black',
                            },
                        }}
                    >
                        {label}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
};
