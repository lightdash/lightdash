import { Group, Select, Text } from '@mantine/core';
import { IconCalendar, IconClearAll } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../common/MantineIcon';
import styles from './CartesianChartXAxisDateFormatConfig.module.css';

const getDateFormatOptions = (t: TFunction) => [
    { value: 'none', label: t('cartesian.dateFormat.none') },
    { value: 'MMM D, YYYY', label: t('cartesian.dateFormat.day') },
    { value: 'ddd, MMM D', label: t('cartesian.dateFormat.week') },
    { value: 'MMM YYYY', label: t('cartesian.dateFormat.month') },
    { value: '[Q]Q YYYY', label: t('cartesian.dateFormat.quarter') },
    { value: 'YYYY', label: t('cartesian.dateFormat.year') },
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
    const { t } = useTranslation('dataViz');
    const dateFormatOptions = useMemo(() => getDateFormatOptions(t), [t]);
    return (
        <Select
            data={dateFormatOptions}
            renderOption={({ option }) => {
                const opt = dateFormatOptions.find(
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
