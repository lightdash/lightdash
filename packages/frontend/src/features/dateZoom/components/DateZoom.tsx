import { TimeFrames } from '@lightdash/common';
import { Button, Menu, Text, useMantineTheme } from '@mantine/core';
import {
    IconCalendarSearch,
    IconChevronDown,
    IconChevronUp,
} from '@tabler/icons-react';
import { useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

const DATE_ZOOM_OPTIONS = [
    // TODO: add support for these times
    {
        value: TimeFrames.DAY,
        label: 'Day',
    },
    {
        value: TimeFrames.MONTH,
        label: 'Month',
    },
    {
        value: TimeFrames.QUARTER,
        label: 'Quarter',
    },
    {
        value: TimeFrames.YEAR,
        label: 'Year',
    },
];

export const DateZoom = () => {
    const theme = useMantineTheme();
    const [isOpen, setIsOpen] = useState(false);
    const [dateGranularity, setDateGranularity] = useState<
        typeof DATE_ZOOM_OPTIONS[0] | undefined
    >(undefined);

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
                                {dateGranularity.label}
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
                {DATE_ZOOM_OPTIONS.map(({ value, label }) => (
                    <Menu.Item
                        fz="xs"
                        key={value}
                        onClick={() => {
                            setDateGranularity({ value, label });
                            setIsOpen(false);
                        }}
                        disabled={dateGranularity?.value === value}
                        bg={
                            dateGranularity?.value === value
                                ? theme.colors.blue['6']
                                : 'white'
                        }
                        sx={{
                            '&[disabled]': {
                                color:
                                    dateGranularity?.value === value
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
