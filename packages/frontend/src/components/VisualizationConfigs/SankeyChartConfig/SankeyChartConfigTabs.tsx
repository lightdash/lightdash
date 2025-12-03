import {
    getItemId,
    isField,
    isTableCalculation,
    SankeyChartLabelPosition,
    SankeyChartOrientation,
    type Dimension,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import {
    Box,
    Checkbox,
    Group,
    MantineProvider,
    NumberInput,
    SegmentedControl,
    Stack,
    Switch,
    Tabs,
    Tooltip,
    useMantineColorScheme,
} from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import FieldSelect from '../../common/FieldSelect';
import { isSankeyVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import { getVizConfigThemeOverride } from '../mantineTheme';

export const ConfigTabs: FC = memo(() => {
    const { colorScheme } = useMantineColorScheme();
    const themeOverride = useMemo(
        () => getVizConfigThemeOverride(colorScheme),
        [colorScheme],
    );

    const { visualizationConfig } = useVisualizationContext();

    if (!isSankeyVisualizationConfig(visualizationConfig)) return null;

    const dimensions = Object.values(visualizationConfig.dimensions);
    const numericFields = Object.values(visualizationConfig.numericFields);

    const {
        sourceField,
        onSourceFieldChange,
        targetField,
        onTargetFieldChange,
        valueField,
        onValueFieldChange,
        nodeWidth,
        onNodeWidthChange,
        nodeGap,
        onNodeGapChange,
        orientation,
        onOrientationChange,
        labels,
        onLabelsChange,
        linkColorMode,
        onLinkColorModeChange,
        draggable,
        toggleDraggable,
    } = visualizationConfig.chartConfig;

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="general" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="general">
                        General
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="display">
                        Display
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="general">
                    <Stack>
                        <Config>
                            <Config.Section>
                                <Config.Heading>Data fields</Config.Heading>

                                <Group spacing="xs">
                                    <Config.Label>Source</Config.Label>
                                    <Tooltip
                                        variant="xs"
                                        disabled={dimensions.length > 0}
                                        label="You must select at least two dimensions to create a Sankey chart"
                                    >
                                        <Box style={{ flex: 1 }}>
                                            <FieldSelect<Dimension>
                                                placeholder="Select source dimension"
                                                disabled={dimensions.length < 2}
                                                item={sourceField}
                                                items={dimensions}
                                                onChange={(newField) => {
                                                    if (
                                                        newField &&
                                                        isField(newField)
                                                    ) {
                                                        onSourceFieldChange(
                                                            getItemId(newField),
                                                        );
                                                    } else {
                                                        onSourceFieldChange(
                                                            null,
                                                        );
                                                    }
                                                }}
                                                hasGrouping
                                            />
                                        </Box>
                                    </Tooltip>
                                </Group>

                                <Group spacing="xs">
                                    <Config.Label>Target</Config.Label>
                                    <Tooltip
                                        variant="xs"
                                        disabled={dimensions.length > 0}
                                        label="You must select at least two dimensions to create a Sankey chart"
                                    >
                                        <Box style={{ flex: 1 }}>
                                            <FieldSelect<Dimension>
                                                placeholder="Select target dimension"
                                                disabled={dimensions.length < 2}
                                                item={targetField}
                                                items={dimensions}
                                                onChange={(newField) => {
                                                    if (
                                                        newField &&
                                                        isField(newField)
                                                    ) {
                                                        onTargetFieldChange(
                                                            getItemId(newField),
                                                        );
                                                    } else {
                                                        onTargetFieldChange(
                                                            null,
                                                        );
                                                    }
                                                }}
                                                hasGrouping
                                            />
                                        </Box>
                                    </Tooltip>
                                </Group>

                                <Group spacing="xs">
                                    <Config.Label>Value</Config.Label>
                                    <Tooltip
                                        variant="xs"
                                        disabled={numericFields.length > 0}
                                        label="You must select at least one numeric metric"
                                    >
                                        <Box style={{ flex: 1 }}>
                                            <FieldSelect<
                                                Metric | TableCalculation
                                            >
                                                placeholder="Select value metric"
                                                disabled={
                                                    numericFields.length === 0
                                                }
                                                item={valueField}
                                                items={numericFields}
                                                onChange={(newField) => {
                                                    if (
                                                        newField &&
                                                        isField(newField)
                                                    ) {
                                                        onValueFieldChange(
                                                            getItemId(newField),
                                                        );
                                                    } else if (
                                                        newField &&
                                                        isTableCalculation(
                                                            newField,
                                                        )
                                                    ) {
                                                        onValueFieldChange(
                                                            newField.name,
                                                        );
                                                    } else {
                                                        onValueFieldChange(
                                                            null,
                                                        );
                                                    }
                                                }}
                                                hasGrouping
                                            />
                                        </Box>
                                    </Tooltip>
                                </Group>
                            </Config.Section>
                        </Config>

                        <Config>
                            <Config.Section>
                                <Config.Heading>Orientation</Config.Heading>
                                <SegmentedControl
                                    value={orientation}
                                    data={[
                                        {
                                            value: SankeyChartOrientation.HORIZONTAL,
                                            label: 'Horizontal',
                                        },
                                        {
                                            value: SankeyChartOrientation.VERTICAL,
                                            label: 'Vertical',
                                        },
                                    ]}
                                    onChange={(value) =>
                                        onOrientationChange(
                                            value as SankeyChartOrientation,
                                        )
                                    }
                                />
                            </Config.Section>
                        </Config>
                    </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="display">
                    <Stack>
                        <Config>
                            <Config.Section>
                                <Config.Heading>Labels</Config.Heading>

                                <Group spacing="xs">
                                    <Config.Label>Position</Config.Label>
                                    <SegmentedControl
                                        value={labels?.position}
                                        data={[
                                            {
                                                value: SankeyChartLabelPosition.LEFT,
                                                label: 'Left',
                                            },
                                            {
                                                value: SankeyChartLabelPosition.INSIDE,
                                                label: 'Inside',
                                            },
                                            {
                                                value: SankeyChartLabelPosition.RIGHT,
                                                label: 'Right',
                                            },
                                            {
                                                value: SankeyChartLabelPosition.HIDDEN,
                                                label: 'Hidden',
                                            },
                                        ]}
                                        onChange={(
                                            newPosition: SankeyChartLabelPosition,
                                        ) =>
                                            onLabelsChange({
                                                position: newPosition,
                                            })
                                        }
                                    />
                                </Group>

                                <Checkbox
                                    checked={labels?.showValue}
                                    onChange={(newValue) =>
                                        onLabelsChange({
                                            showValue:
                                                newValue.currentTarget.checked,
                                        })
                                    }
                                    label="Show value in labels"
                                />
                            </Config.Section>
                        </Config>

                        <Config>
                            <Config.Section>
                                <Config.Heading>Node styling</Config.Heading>

                                <Group spacing="xs">
                                    <Config.Label>Node width</Config.Label>
                                    <NumberInput
                                        value={nodeWidth}
                                        onChange={(value) =>
                                            onNodeWidthChange(
                                                typeof value === 'number'
                                                    ? value
                                                    : 20,
                                            )
                                        }
                                        min={5}
                                        max={100}
                                        step={5}
                                        style={{ width: 80 }}
                                    />
                                </Group>

                                <Group spacing="xs">
                                    <Config.Label>Node gap</Config.Label>
                                    <NumberInput
                                        value={nodeGap}
                                        onChange={(value) =>
                                            onNodeGapChange(
                                                typeof value === 'number'
                                                    ? value
                                                    : 10,
                                            )
                                        }
                                        min={0}
                                        max={100}
                                        step={5}
                                        style={{ width: 80 }}
                                    />
                                </Group>
                            </Config.Section>
                        </Config>

                        <Config>
                            <Config.Section>
                                <Config.Heading>Link color</Config.Heading>
                                <SegmentedControl
                                    value={linkColorMode}
                                    data={[
                                        { value: 'source', label: 'Source' },
                                        { value: 'target', label: 'Target' },
                                        {
                                            value: 'gradient',
                                            label: 'Gradient',
                                        },
                                    ]}
                                    onChange={(value) =>
                                        onLinkColorModeChange(
                                            value as
                                                | 'source'
                                                | 'target'
                                                | 'gradient',
                                        )
                                    }
                                />
                            </Config.Section>
                        </Config>

                        <Config>
                            <Config.Section>
                                <Group>
                                    <Config.Heading>
                                        Allow node dragging
                                    </Config.Heading>
                                    <Switch
                                        checked={draggable}
                                        onChange={toggleDraggable}
                                    />
                                </Group>
                            </Config.Section>
                        </Config>
                    </Stack>
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});
