import { MetricType, type YLayoutOptions } from '@lightdash/common';
import { Group, SegmentedControl, Text } from '@mantine/core';
import {
    IconMathFunction,
    IconMathMax,
    IconMathMin,
    IconMathOff,
    IconSum,
    IconTrendingUp,
} from '@tabler/icons-react';
import { capitalize } from 'lodash';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

const AggregationIcon: FC<{ aggregation: string | undefined }> = ({
    aggregation,
}) => {
    return (
        <MantineIcon
            color="indigo.4"
            icon={
                aggregation === MetricType.COUNT
                    ? IconMathFunction
                    : aggregation === MetricType.SUM
                    ? IconSum
                    : aggregation === MetricType.AVERAGE
                    ? IconTrendingUp
                    : aggregation === MetricType.MIN
                    ? IconMathMin
                    : aggregation === MetricType.MAX
                    ? IconMathMax
                    : aggregation === 'none'
                    ? IconMathOff
                    : IconMathOff
            }
        />
    );
};

type Props = {
    options: YLayoutOptions['aggregationOptions'] | undefined;
    aggregation: YLayoutOptions['aggregationOptions'][number] | undefined;
    onChangeAggregation: (
        value: YLayoutOptions['aggregationOptions'][number],
    ) => void;
};

export const BarChartAggregationConfig: FC<Props> = ({
    options,
    onChangeAggregation,
    aggregation,
}) => {
    const aggregationOptionsWithNone = options ?? [];

    return (
        <SegmentedControl
            data={aggregationOptionsWithNone.map((option) => ({
                value: option,
                label: (
                    <Group noWrap spacing={0}>
                        <AggregationIcon aggregation={option} />
                        <Text>{capitalize(option)}</Text>
                    </Group>
                ),
            }))}
            value={aggregation ?? aggregationOptionsWithNone?.[0]}
            onChange={(value) => value && onChangeAggregation(value)}
        />
    );
};
