import {
    MetricType,
    VizAggregationOptions,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { Box, Group, Select, Text } from '@mantine/core';
import {
    IconAsterisk,
    IconMathFunction,
    IconMathMax,
    IconMathMin,
    IconMathOff,
    IconSum,
    IconTrendingUp,
} from '@tabler/icons-react';
import { capitalize } from 'lodash';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

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
    aggregation:
        | VizValuesLayoutOptions['aggregationOptions'][number]
        | undefined;
    onChangeAggregation: (
        value: VizValuesLayoutOptions['aggregationOptions'][number],
    ) => void;
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
    const aggregationOptionsWithNone = options ?? [];

    return (
        <Select
            radius="md"
            data={aggregationOptionsWithNone.map((option) => ({
                value: option,
                label: capitalize(option),
            }))}
            itemComponent={AggregationItem}
            icon={aggregation && <AggregationIcon aggregation={aggregation} />}
            value={aggregation ?? aggregationOptionsWithNone?.[0]}
            onChange={(value: VizAggregationOptions | null) =>
                value && onChangeAggregation(value)
            }
            styles={(theme) => ({
                input: {
                    width: '110px',
                    fontWeight: 500,
                },
                item: {
                    '&[data-selected="true"]': {
                        color: theme.colors.gray[7],
                        fontWeight: 500,
                        backgroundColor: theme.colors.gray[2],
                    },
                    '&[data-selected="true"]:hover': {
                        backgroundColor: theme.colors.gray[3],
                    },
                    '&:hover': {
                        backgroundColor: theme.colors.gray[1],
                    },
                },
            })}
        />
    );
};
