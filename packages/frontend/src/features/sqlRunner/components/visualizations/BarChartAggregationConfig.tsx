import { MetricType, type YLayoutOptions } from '@lightdash/common';
import { Group, SegmentedControl, Text } from '@mantine/core';
import {
    IconMathFunction,
    IconMathMax,
    IconMathMin,
    IconMathOff,
    IconNumber1,
    IconSum,
    IconTrendingUp,
} from '@tabler/icons-react';
import { capitalize } from 'lodash';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';

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
            icon = IconTrendingUp;
            break;
        case MetricType.MIN:
            icon = IconMathMin;
            break;
        case MetricType.MAX:
            icon = IconMathMax;
            break;
        case 'first':
            icon = IconNumber1;
            break;
        default:
            icon = IconMathOff;
    }
    return <MantineIcon color="indigo.4" icon={icon} />;
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
