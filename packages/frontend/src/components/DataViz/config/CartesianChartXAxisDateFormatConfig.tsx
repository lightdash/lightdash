import { Box, Group, Select, Text } from '@mantine/core';
import { IconCalendar, IconClearAll } from '@tabler/icons-react';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

const DATE_FORMAT_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'MMM D, YYYY', label: 'Day' },
    { value: 'ddd, MMM D', label: 'Week' },
    { value: 'MMM YYYY', label: 'Month' },
    { value: '[Q]Q YYYY', label: 'Quarter' },
    { value: 'YYYY', label: 'Year' },
];

const DateFormatIcon: FC<{ format: string | undefined }> = ({ format }) => {
    const icon = format ? IconCalendar : IconClearAll;
    return <MantineIcon color={format ? 'indigo.4' : 'ldGray.4'} icon={icon} />;
};

const DateFormatItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & { value: string; selected: boolean }
>(({ value, ...others }, ref) => {
    const option = DATE_FORMAT_OPTIONS.find((o) => o.value === value);
    return (
        <Box ref={ref} {...others}>
            <Group noWrap spacing="xs">
                <DateFormatIcon
                    format={value === 'none' ? undefined : value}
                />
                <Text>{option?.label ?? value}</Text>
            </Group>
        </Box>
    );
});

type Props = {
    dateFormat: string | undefined;
    onChangeDateFormat: (value: string | undefined) => void;
};

export const CartesianChartXAxisDateFormatConfig: FC<Props> = ({
    dateFormat,
    onChangeDateFormat,
}) => {
    return (
        <Select
            radius="md"
            data={DATE_FORMAT_OPTIONS}
            itemComponent={DateFormatItem}
            icon={
                <DateFormatIcon format={dateFormat} />
            }
            value={dateFormat ?? 'none'}
            onChange={(value) => {
                onChangeDateFormat(
                    value === 'none' || value === null ? undefined : value,
                );
            }}
            styles={(theme) => ({
                input: {
                    width: '130px',
                    fontWeight: 500,
                },
                item: {
                    '&[data-selected="true"]': {
                        color: theme.colors.ldGray[7],
                        fontWeight: 500,
                        backgroundColor: theme.colors.ldGray[2],
                    },
                    '&[data-selected="true"]:hover': {
                        backgroundColor: theme.colors.ldGray[3],
                    },
                    '&:hover': {
                        backgroundColor: theme.colors.ldGray[1],
                    },
                },
            })}
        />
    );
};
