import {
    getAvailableChartTypes,
    type ChartTypeOption,
    type MetricQuery,
} from '@lightdash/common';
import { SegmentedControl } from '@mantine-8/core';
import { IconChartBar, IconChartLine, IconTable } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';

type Props = {
    metricQuery: MetricQuery;
    selectedChartType: ChartTypeOption;
    onChartTypeChange: (chartType: ChartTypeOption) => void;
};

const CHART_TYPE_ICONS: Record<ChartTypeOption, typeof IconTable> = {
    table: IconTable,
    bar: IconChartBar,
    line: IconChartLine,
};

const CHART_TYPE_LABELS: Record<ChartTypeOption, string> = {
    table: 'Table',
    bar: 'Bar',
    line: 'Line',
};

export const AgentVisualizationChartTypeSwitcher: FC<Props> = ({
    metricQuery,
    selectedChartType,
    onChartTypeChange,
}) => {
    const availableChartTypes = getAvailableChartTypes(metricQuery);

    if (availableChartTypes.length <= 1) {
        // Don't show switcher if only one chart type is available
        return null;
    }

    return (
        <SegmentedControl
            value={selectedChartType}
            onChange={(value) => onChartTypeChange(value as ChartTypeOption)}
            data={availableChartTypes.map((chartType) => ({
                value: chartType,
                label: (
                    <>
                        <MantineIcon
                            icon={CHART_TYPE_ICONS[chartType]}
                            size="sm"
                        />
                        {CHART_TYPE_LABELS[chartType]}
                    </>
                ),
            }))}
            size="xs"
        />
    );
};
