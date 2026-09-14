import { ChartKind } from '@lightdash/common';
import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { memo, type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import { getChartIcon } from '../common/ResourceIcon/utils';

type VisualizationActionIconProps = {
    chartKind: ChartKind;
    label: string;
    selected: boolean;
    onClick: () => void;
};

const VisualizationActionIcon: FC<VisualizationActionIconProps> = memo(
    ({ chartKind, label, onClick, selected }) => (
        <Tooltip label={label}>
            <ActionIcon
                size="lg"
                variant={selected ? 'light' : 'subtle'}
                aria-label={label}
                aria-pressed={selected}
                onClick={onClick}
                data-testid={`visualization-${chartKind}`}
            >
                <MantineIcon
                    icon={getChartIcon(chartKind)}
                    transform={
                        chartKind === ChartKind.HORIZONTAL_BAR
                            ? 'rotate(90)'
                            : undefined
                    }
                />
            </ActionIcon>
        </Tooltip>
    ),
);

export const VisualizationSwitcher = ({
    selectedChartType,
    setSelectedChartType,
}: {
    selectedChartType: ChartKind;
    setSelectedChartType: (chartKind: ChartKind) => void;
}) => {
    const AVAILABLE_VISUALIZATIONS = [
        { label: 'Table', value: ChartKind.TABLE },
        { label: 'Bar chart', value: ChartKind.VERTICAL_BAR },
        { label: 'Line chart', value: ChartKind.LINE },
        { label: 'Pie chart', value: ChartKind.PIE },
        { label: 'Big value', value: ChartKind.BIG_NUMBER },
    ];

    return (
        <Group gap={4}>
            {AVAILABLE_VISUALIZATIONS.map((vis) => (
                <VisualizationActionIcon
                    key={vis.label}
                    chartKind={vis.value}
                    label={vis.label}
                    onClick={() => setSelectedChartType(vis.value)}
                    selected={selectedChartType === vis.value}
                />
            ))}
        </Group>
    );
};
