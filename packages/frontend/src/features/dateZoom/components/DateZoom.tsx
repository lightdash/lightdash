import { DateGranularity } from '@lightdash/common';
import { Button, Menu, Text, useMantineTheme } from '@mantine/core';
import {
    IconCalendarSearch,
    IconChevronDown,
    IconChevronUp,
} from '@tabler/icons-react';
import { useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useDashboardContext } from '../../../providers/DashboardProvider';

export const DateZoom = () => {
    const theme = useMantineTheme();
    const [isOpen, setIsOpen] = useState(false);
    const dateGranularity = useDashboardContext((c) => c.dateGranularity);
    const setDateGranularity = useDashboardContext((c) => c.setDateGranularity);

    return (
        <Menu
            withinPortal
            withArrow
            closeOnItemClick
            closeOnClickOutside
            opened={isOpen}
            offset={-1}
            position="bottom-end"
        >
            <Menu.Target>
                <Button
                    size="xs"
                    variant="default"
                    loaderPosition="center"
                    onClick={() => {
                        setIsOpen((prev) => !prev);
                    }}
                    sx={{
                        borderColor: dateGranularity
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
                        {dateGranularity ? `:` : null}{' '}
                        {dateGranularity ? (
                            <Text span fw={500}>
                                {dateGranularity}
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
                        setDateGranularity(undefined);
                        setIsOpen(false);
                    }}
                    bg={
                        dateGranularity === undefined
                            ? theme.colors.blue['6']
                            : 'white'
                    }
                    disabled={dateGranularity === undefined}
                    sx={{
                        '&[disabled]': {
                            color:
                                dateGranularity === undefined
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
                            setDateGranularity(granularity);
                            setIsOpen(false);
                        }}
                        disabled={dateGranularity === granularity}
                        bg={
                            dateGranularity === granularity
                                ? theme.colors.blue['6']
                                : 'white'
                        }
                        sx={{
                            '&[disabled]': {
                                color:
                                    dateGranularity === granularity
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
