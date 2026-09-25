import { type ComposerVizKind } from '@lightdash/common';
import { SegmentedControl } from '@mantine/core';
import {
    IconChartBar,
    IconChartLine,
    IconChartPie,
    IconChartScatter,
    IconFilter,
    IconTable,
} from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import classes from './AgentVisualizationChartTypeSwitcher.module.css';

type Props<T extends ComposerVizKind> = {
    /** Kinds this result supports; the switcher hides itself with fewer than two. */
    availableChartTypes: T[];
    selectedChartType: T;
    onChartTypeChange: (chartType: T) => void;
    variant?: 'default' | 'pill';
};

const CHART_TYPE_ICONS: Record<ComposerVizKind, typeof IconTable> = {
    table: IconTable,
    bar: IconChartBar,
    horizontal: IconChartBar,
    line: IconChartLine,
    scatter: IconChartScatter,
    pie: IconChartPie,
    funnel: IconFilter,
};

export const AgentVisualizationChartTypeSwitcher = <T extends ComposerVizKind>({
    availableChartTypes,
    selectedChartType,
    onChartTypeChange,
    variant = 'default',
}: Props<T>) => {
    if (availableChartTypes.length <= 1) {
        return null;
    }

    const isPill = variant === 'pill';

    return (
        <SegmentedControl
            value={selectedChartType}
            onChange={(value) => onChartTypeChange(value as T)}
            data={availableChartTypes.map((chartType) => ({
                value: chartType,
                label: (
                    <MantineIcon
                        icon={CHART_TYPE_ICONS[chartType]}
                        size="sm"
                        stroke={1.3}
                        style={{
                            rotate:
                                chartType === 'horizontal' ? '90deg' : '0deg',
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
