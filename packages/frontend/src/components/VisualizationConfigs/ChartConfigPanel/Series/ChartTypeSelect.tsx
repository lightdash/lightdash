import { CartesianSeriesType } from '@lightdash/common';
import { type SelectProps, Select } from '@mantine/core';
import {
    IconChartArea,
    IconChartAreaLine,
    IconChartBar,
    IconChartDots,
    IconChartLine,
} from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../common/MantineIcon';

const getChartTypeOptions = (t: TFunction) => [
    {
        value: CartesianSeriesType.BAR,
        label: t('series.chartType.bar'),
        icon: IconChartBar,
    },
    {
        value: CartesianSeriesType.LINE,
        label: t('series.chartType.line'),
        icon: IconChartLine,
    },
    {
        value: CartesianSeriesType.AREA,
        label: t('series.chartType.area'),
        icon: IconChartArea,
    },
    {
        value: CartesianSeriesType.SCATTER,
        label: t('series.chartType.scatter'),
        icon: IconChartDots,
    },
];

type Props = {
    chartValue: string;
    showMixed: boolean;
    showLabel?: boolean;
} & Pick<SelectProps, 'onChange'>;

export const ChartTypeSelect: FC<Props> = ({
    chartValue,
    onChange,
    showMixed,
    showLabel = true,
}) => {
    const { t } = useTranslation('vizConfig');
    const options = useMemo(
        () => [
            ...getChartTypeOptions(t),
            ...(showMixed
                ? [
                      {
                          value: 'mixed',
                          label: t('series.chartType.mixed'),
                          icon: IconChartAreaLine,
                      },
                  ]
                : []),
        ],
        [showMixed, t],
    );

    const selectedChartIcon = useMemo(
        () => options.find((type) => type.value === chartValue)?.icon,
        [chartValue, options],
    );

    return (
        <Select
            allowDeselect={false}
            label={showLabel && t('series.chartType.type')}
            value={chartValue}
            data={options}
            onChange={onChange}
            renderOption={({ option }) => {
                const chartType = options.find(
                    ({ value }) => value === option.value,
                );
                return chartType ? (
                    <MantineIcon icon={chartType.icon} />
                ) : (
                    option.label
                );
            }}
            leftSection={
                selectedChartIcon && (
                    <MantineIcon color="ldGray.8" icon={selectedChartIcon} />
                )
            }
            styles={{
                input: {
                    color: 'transparent',
                    width: '4px',
                },
            }}
        />
    );
};
