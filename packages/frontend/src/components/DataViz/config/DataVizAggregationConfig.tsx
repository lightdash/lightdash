import {
    MetricType,
    VizAggregationOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import {
    Box,
    Group,
    Select,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
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
import { usePillSelectStyles } from '../hooks/usePillSelectStyles';

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
            icon = IconSum;
            break;
        case MetricType.AVERAGE:
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
>(({ value, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Group noWrap spacing="xs">
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
    const {
        colors,
        colorScheme,
        fn: { lighten },
    } = useMantineTheme();
    const { classes } = usePillSelectStyles({
        backgroundColor:
            colorScheme === 'light'
                ? lighten(colors.indigo[0], 0.5)
                : colors.indigo[5],
        textColor:
            colorScheme === 'light' ? colors.indigo[4] : colors.indigo[0],
    });
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
                withinPortal
                data={selectOptions}
                itemComponent={AggregationItem}
                value={aggregation ?? aggregationOptionsWithNone?.[0]}
                onChange={(value: VizAggregationOptions | null) =>
                    value && onChangeAggregation(value)
                }
                classNames={{
                    item: classes.item,
                    dropdown: classes.dropdown,
                    input: classes.input,
                    rightSection: classes.rightSection,
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
