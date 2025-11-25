import { ChartKind } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Group,
    Paper,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
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
    ({ chartKind, label, onClick, selected }) => {
        const { colors, colorScheme } = useMantineTheme();
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
                    >
                        <Paper
                            display="flex"
                            w={32}
                            h={32}
                            component={Center}
                            withBorder
                            radius="sm"
                            shadow={selected ? 'sm' : 'none'}
                            sx={(theme) => ({
                                backgroundColor: selected
                                    ? ICON_SELECTED_BG_COLOR
                                    : theme.colors.ldGray[0],
                                '&[data-with-border]': {
                                    borderColor: selected
                                        ? ICON_SELECTED_COLOR
                                        : 'none',
                                },
                            })}
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
        <Group spacing="xs">
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
