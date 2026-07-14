import {
    MetricType,
    VizAggregationOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { Box, Group, Text, Select } from '@mantine-8/core';
import { Tooltip } from '@mantine/core';
import {
    IconAsterisk,
    IconMathFunction,
    IconMathMax,
    IconMathMin,
    IconMathOff,
    IconSum,
    IconTrendingUp,
} from '@tabler/icons-react';
import capitalize from 'lodash/capitalize';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
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

type Props = {
    options: VizValuesLayoutOptions['aggregationOptions'] | undefined;
    aggregation: VizAggregationOptions | undefined;
    onChangeAggregation: (value: VizAggregationOptions) => void;
};

const AggregationItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & { value: string; selected: boolean }
>(({ value, selected: _selected, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Group wrap="nowrap" gap="xs">
            <AggregationIcon aggregation={value} />
            <Text>{capitalize(value)}</Text>
        </Group>
    </Box>
));

export const DataVizAggregationConfig: FC<Props> = ({
    options,
    onChangeAggregation,
    aggregation,
}) => {
    const aggregationOptionsWithNone = options ?? [];

    const selectOptions = aggregationOptionsWithNone.map((option) => ({
        value: option,
        label:
            option === VizAggregationOptions.ANY
                ? 'Any value'
                : capitalize(option),
    }));

    return (
        <Tooltip label="Aggregation type" variant="xs" withinPortal>
            <Select
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
                data={selectOptions}
                renderOption={({ option, checked }) => (
                    <AggregationItem
                        value={option.value}
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
