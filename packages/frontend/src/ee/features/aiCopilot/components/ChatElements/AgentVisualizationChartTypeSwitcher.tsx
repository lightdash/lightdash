import {
    getAvailableChartTypes,
    type AiAgentChartTypeOption,
    type MetricQuery,
} from '@lightdash/common';
import { SegmentedControl } from '@mantine-8/core';
import {
    IconChartBar,
    IconChartLine,
    IconChartPie,
    IconChartScatter,
    IconFilter,
    IconTable,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import classes from './AgentVisualizationChartTypeSwitcher.module.css';

type Props = {
    metricQuery: MetricQuery;
    selectedChartType: AiAgentChartTypeOption;
    onChartTypeChange: (chartType: AiAgentChartTypeOption) => void;
    hasGroupByDimensions: boolean;
    variant?: 'default' | 'pill';
};

const CHART_TYPE_ICONS: Record<AiAgentChartTypeOption, typeof IconTable> = {
    table: IconTable,
    bar: IconChartBar,
    horizontal: IconChartBar,
    line: IconChartLine,
    scatter: IconChartScatter,
    pie: IconChartPie,
    funnel: IconFilter,
};

export const AgentVisualizationChartTypeSwitcher: FC<Props> = ({
    metricQuery,
    selectedChartType,
    onChartTypeChange,
    hasGroupByDimensions,
    variant = 'default',
}) => {
    const availableChartTypes = getAvailableChartTypes(metricQuery);

    if (availableChartTypes.length <= 1) {
        // Don't show switcher if only one chart type is available
        return null;
    }

    const isPill = variant === 'pill';

    return (
        <SegmentedControl
            value={selectedChartType}
            onChange={(value) =>
                onChartTypeChange(value as AiAgentChartTypeOption)
            }
            data={availableChartTypes
                .filter((chartType) => {
                    // Pie and funnel charts are not supported with group by dimensions, they're meant to be used with a single dimension
                    if (
                        hasGroupByDimensions &&
                        (chartType === 'pie' || chartType === 'funnel')
                    ) {
                        return false;
                    }
                    return true;
                })
                .map((chartType) => ({
                    value: chartType,
                    label: (
                        <MantineIcon
                            icon={CHART_TYPE_ICONS[chartType]}
                            size="sm"
                            stroke={1.3}
                            style={{
                                rotate:
                                    chartType === 'horizontal'
                                        ? '90deg'
                                        : '0deg',
                            }}
                        />
                    ),
                }))}
            color={isPill ? undefined : 'indigo'}
            size="xs"
            classNames={
                isPill
                    ? {
                          root: classes.pillRoot,
                          control: classes.pillControl,
                          indicator: classes.pillIndicator,
                          label: classes.pillLabel,
                      }
                    : undefined
            }
        />
    );
};
