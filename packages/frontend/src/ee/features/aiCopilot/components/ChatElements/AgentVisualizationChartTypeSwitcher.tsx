import {
    type AiAgentChartTypeOption,
    type ComposerVizKind,
    type UiStringKey,
} from '@lightdash/common';
import { SegmentedControl, VisuallyHidden } from '@mantine/core';
import {
    IconNumber123,
    IconChartBar,
    IconChartLine,
    IconChartPie,
    IconChartScatter,
    IconFilter,
    IconTable,
} from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import classes from './AgentVisualizationChartTypeSwitcher.module.css';

type SwitcherKind = AiAgentChartTypeOption | ComposerVizKind;

type Props<T extends SwitcherKind> = {
    /** Kinds this result supports; the switcher hides itself with fewer than two. */
    availableChartTypes: T[];
    selectedChartType: T;
    onChartTypeChange: (chartType: T) => void;
    variant?: 'default' | 'pill';
};

const CHART_TYPES: Record<
    SwitcherKind,
    { icon: typeof IconTable; label: UiStringKey }
> = {
    table: { icon: IconTable, label: 'aiAgent.chartType.table' },
    bar: { icon: IconChartBar, label: 'aiAgent.chartType.bar' },
    horizontal: { icon: IconChartBar, label: 'aiAgent.chartType.horizontal' },
    line: { icon: IconChartLine, label: 'aiAgent.chartType.line' },
    scatter: { icon: IconChartScatter, label: 'aiAgent.chartType.scatter' },
    pie: { icon: IconChartPie, label: 'aiAgent.chartType.pie' },
    funnel: { icon: IconFilter, label: 'aiAgent.chartType.funnel' },
    big_number: { icon: IconNumber123, label: 'aiAgent.chartType.big_number' },
};

export const AgentVisualizationChartTypeSwitcher = <T extends SwitcherKind>({
    availableChartTypes,
    selectedChartType,
    onChartTypeChange,
    variant = 'default',
}: Props<T>) => {
    const getUiString = useUiStrings();

    if (availableChartTypes.length <= 1) {
        return null;
    }

    const isPill = variant === 'pill';

    return (
        <SegmentedControl
            aria-label={getUiString('aiAgent.chartType.label')}
            value={selectedChartType}
            onChange={(value) => onChartTypeChange(value as T)}
            data={availableChartTypes.map((chartType) => ({
                value: chartType,
                label: (
                    <>
                        <MantineIcon
                            icon={CHART_TYPES[chartType].icon}
                            size="sm"
                            stroke={1.3}
                            className={
                                chartType === 'horizontal'
                                    ? classes.rotatedIcon
                                    : undefined
                            }
                        />
                        <VisuallyHidden>
                            {getUiString(CHART_TYPES[chartType].label)}
                        </VisuallyHidden>
                    </>
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
