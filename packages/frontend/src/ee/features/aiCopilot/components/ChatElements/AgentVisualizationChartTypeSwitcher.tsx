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

const CHART_TYPE_ICONS: Record<SwitcherKind, typeof IconTable> = {
    table: IconTable,
    bar: IconChartBar,
    horizontal: IconChartBar,
    line: IconChartLine,
    scatter: IconChartScatter,
    pie: IconChartPie,
    funnel: IconFilter,
    big_number: IconNumber123,
};

const CHART_TYPE_LABELS: Record<SwitcherKind, UiStringKey> = {
    table: 'aiAgent.chartType.table',
    bar: 'aiAgent.chartType.bar',
    horizontal: 'aiAgent.chartType.horizontal',
    line: 'aiAgent.chartType.line',
    scatter: 'aiAgent.chartType.scatter',
    pie: 'aiAgent.chartType.pie',
    funnel: 'aiAgent.chartType.funnel',
    big_number: 'aiAgent.chartType.big_number',
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
                            icon={CHART_TYPE_ICONS[chartType]}
                            size="sm"
                            stroke={1.3}
                            className={
                                chartType === 'horizontal'
                                    ? classes.rotatedIcon
                                    : undefined
                            }
                        />
                        <VisuallyHidden>
                            {getUiString(CHART_TYPE_LABELS[chartType])}
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
