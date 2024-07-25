import { MetricType, type YLayoutOptions } from '@lightdash/common';
import { Group, Select, Text, type SelectItemProps } from '@mantine/core';
import {
    IconMathFunction,
    IconMathMax,
    IconMathMin,
    IconMathOff,
    IconSum,
    IconTrendingUp,
} from '@tabler/icons-react';
import { capitalize } from 'lodash';
import { forwardRef, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { Config } from '../../../../components/VisualizationConfigs/common/Config';

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
};

// TODO: Oliver add onChange of aggregation - what should happen with duck db?
export const BarChartAggregationConfig: FC<Props> = ({ options }) => {
    const aggregationOptionsWithNone = ['None', ...(options ?? [])];

    return (
        <Config>
            <Config.Label>Aggregation</Config.Label>
            <Select
                data={aggregationOptionsWithNone.map((option) => ({
                    value: option,
                    label: capitalize(option),
                }))}
                itemComponent={forwardRef<HTMLDivElement, SelectItemProps>(
                    ({ label, value, ...others }, ref) => (
                        <div ref={ref} {...others}>
                            <Group noWrap>
                                <AggregationIcon aggregation={value} />

                                <Text size="sm">{label}</Text>
                            </Group>
                        </div>
                    ),
                )}
                value={aggregationOptionsWithNone?.[0]}
                onChange={(value) => console.log(value)}
                icon={<AggregationIcon aggregation={'none'} />}
            />
        </Config>
    );
};
