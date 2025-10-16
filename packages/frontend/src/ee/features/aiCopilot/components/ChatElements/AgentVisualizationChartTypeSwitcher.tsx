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

type Props = {
    metricQuery: MetricQuery;
    selectedChartType: AiAgentChartTypeOption;
    onChartTypeChange: (chartType: AiAgentChartTypeOption) => void;
    hasGroupByDimensions: boolean;
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
}) => {
    const availableChartTypes = getAvailableChartTypes(metricQuery);

    if (availableChartTypes.length <= 1) {
        // Don't show switcher if only one chart type is available
        return null;
    }

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
                            style={{
                                rotate:
                                    chartType === 'horizontal'
                                        ? '90deg'
                                        : '0deg',
                            }}
                        />
                    ),
                }))}
            color="indigo"
            size="xs"
        />
    );
};
