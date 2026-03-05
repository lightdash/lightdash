import { Group, Select, Text } from '@mantine-8/core';
import { IconCalendar, IconClearAll } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import styles from './CartesianChartXAxisDateFormatConfig.module.css';

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
            renderOption={({ option }) => {
                const opt = DATE_FORMAT_OPTIONS.find(
                    (o) => o.value === option.value,
                );
                return (
                    <Group wrap="nowrap" gap="xs">
                        <DateFormatIcon
                            format={
                                option.value === 'none'
                                    ? undefined
                                    : option.value
                            }
                        />
                        <Text>{opt?.label ?? option.value}</Text>
                    </Group>
                );
            }}
            leftSection={<DateFormatIcon format={dateFormat} />}
            value={dateFormat ?? 'none'}
            onChange={(value) => {
                onChangeDateFormat(
                    value === 'none' || value === null ? undefined : value,
                );
            }}
            classNames={{
                input: styles.input,
                option: styles.option,
            }}
        />
    );
};
