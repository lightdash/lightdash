import {
    MetricType,
    VizAggregationOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { Box, Group, Text, Select, Tooltip } from '@mantine/core';
import {
    IconAsterisk,
    IconMathFunction,
    IconMathMax,
    IconMathMin,
    IconMathOff,
    IconSum,
    IconTrendingUp,
} from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../common/MantineIcon';
import classes from './PillSelect.module.css';

// TODO: this should be a typed enum (VizAggregationOptions) and exhaustive switch case
const AggregationIcon: FC<{ aggregation: string | undefined }> = ({
    aggregation,
}) => {
    let icon;
    switch (aggregation) {
        case MetricType.COUNT:
            icon = IconMathFunction;
            break;
        case MetricType.SUM:
        case MetricType.SUM_DISTINCT:
            icon = IconSum;
            break;
        case MetricType.AVERAGE:
        case MetricType.AVERAGE_DISTINCT:
        case VizAggregationOptions.AVERAGE:
            icon = IconTrendingUp;
            break;
        case MetricType.MIN:
            icon = IconMathMin;
            break;
        case MetricType.MAX:
            icon = IconMathMax;
            break;
        case VizAggregationOptions.ANY:
            icon = IconAsterisk;
            break;
        default:
            icon = IconMathOff;
    }

    return <MantineIcon color="indigo.4" icon={icon} />;
};

const getAggregationLabel = (
    t: TFunction,
    option: VizAggregationOptions,
): string => {
    switch (option) {
        case VizAggregationOptions.SUM:
            return t('aggregation.sum');
        case VizAggregationOptions.COUNT:
            return t('aggregation.count');
        case VizAggregationOptions.AVERAGE:
            return t('aggregation.avg');
        case VizAggregationOptions.MIN:
            return t('aggregation.min');
        case VizAggregationOptions.MAX:
            return t('aggregation.max');
        case VizAggregationOptions.ANY:
            return t('aggregation.any');
        default:
            // Runtime options may include values outside the enum
            return String(option);
    }
};

type Props = {
    options: VizValuesLayoutOptions['aggregationOptions'] | undefined;
    aggregation: VizAggregationOptions | undefined;
    onChangeAggregation: (value: VizAggregationOptions) => void;
};

const AggregationItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & {
        value: string;
        label: string;
        selected: boolean;
    }
>(({ value, label, selected: _selected, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Group wrap="nowrap" gap="xs">
            <AggregationIcon aggregation={value} />
            <Text>{label}</Text>
        </Group>
    </Box>
));

export const DataVizAggregationConfig: FC<Props> = ({
    options,
    onChangeAggregation,
    aggregation,
}) => {
    const { t } = useTranslation('dataViz');
    const aggregationOptionsWithNone = options ?? [];

    const selectOptions = aggregationOptionsWithNone.map((option) => ({
        value: option,
        label: getAggregationLabel(t, option),
    }));

    return (
        <Tooltip label={t('aggregation.tooltip')}>
            <Select
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
                data={selectOptions}
                renderOption={({ option, checked }) => (
                    <AggregationItem
                        value={option.value}
                        label={getAggregationLabel(
                            t,
                            option.value as VizAggregationOptions,
                        )}
                        selected={checked ?? false}
                    />
                )}
                value={aggregation ?? aggregationOptionsWithNone?.[0]}
                onChange={(value) =>
                    value && onChangeAggregation(value as VizAggregationOptions)
                }
                classNames={{
                    option: `${classes.option} ${classes.indigoOption}`,
                    dropdown: classes.dropdown,
                    input: `${classes.input} ${classes.indigoInput}`,
                    section: classes.section,
                }}
                styles={{
                    input: {
                        width:
                            aggregation === VizAggregationOptions.ANY
                                ? '70px'
                                : '50px',
                    },
                }}
            />
        </Tooltip>
    );
};
