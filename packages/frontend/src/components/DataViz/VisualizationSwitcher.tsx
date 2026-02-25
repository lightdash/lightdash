import { ChartKind } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Paper,
    Tooltip,
    useMantineColorScheme,
    useMantineTheme,
} from '@mantine-8/core';
import { clsx } from '@mantine/core';
import { memo, type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import { getChartIcon } from '../common/ResourceIcon/utils';
import classes from './VisualizationSwitcher.module.css';

type VisualizationActionIconProps = {
    chartKind: ChartKind;
    label: string;
    selected: boolean;
    onClick: () => void;
};

const VisualizationActionIcon: FC<VisualizationActionIconProps> = memo(
    ({ chartKind, label, onClick, selected }) => {
        const { colors } = useMantineTheme();
        const { colorScheme } = useMantineColorScheme();
        const ICON_SELECTED_COLOR =
            colorScheme === 'light' ? colors.violet[6] : colors.violet[2];
        const ICON_SELECTED_BG_COLOR =
            colorScheme === 'light' ? colors.violet[0] : colors.violet[6];
        const ICON_UNSELECTED_COLOR = colors.ldGray[9];

        return (
            <Tooltip variant="xs" label={label} withinPortal>
                <Box>
                    <ActionIcon
                        onClick={onClick}
                        w={32}
                        h={32}
                        data-testid={`visualization-${chartKind}`}
                        color={selected ? 'violet' : 'ldGray.5'}
                    >
                        <Paper
                            w={32}
                            h={32}
                            withBorder
                            radius="sm"
                            shadow={selected ? 'sm' : undefined}
                            className={clsx(
                                classes.actionPaper,
                                selected && classes.actionPaperSelected,
                            )}
                            style={
                                {
                                    '--action-paper-bg-selected':
                                        ICON_SELECTED_BG_COLOR,
                                    '--action-paper-border-selected':
                                        ICON_SELECTED_COLOR,
                                } as React.CSSProperties
                            }
                        >
                            <MantineIcon
                                icon={getChartIcon(chartKind)}
                                color={
                                    selected
                                        ? ICON_SELECTED_COLOR
                                        : ICON_UNSELECTED_COLOR
                                }
                                fill={
                                    selected
                                        ? ICON_SELECTED_COLOR
                                        : ICON_UNSELECTED_COLOR
                                }
                                transform={
                                    chartKind === ChartKind.HORIZONTAL_BAR
                                        ? 'rotate(90)'
                                        : undefined
                                }
                                stroke={1.5}
                                fillOpacity={0.1}
                            />
                        </Paper>
                    </ActionIcon>
                </Box>
            </Tooltip>
        );
    },
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
    ];

    return (
        <Group gap="xs">
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
