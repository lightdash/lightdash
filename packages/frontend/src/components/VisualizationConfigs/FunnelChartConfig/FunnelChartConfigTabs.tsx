import {
    FunnelChartDataInput,
    FunnelChartLabelPosition,
    FunnelChartLegendPosition,
    getItemId,
    isField,
    isTableCalculation,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import {
    Box,
    Checkbox,
    Collapse,
    Group,
    MantineProvider,
    SegmentedControl,
    Stack,
    Switch,
    Tabs,
    Tooltip,
} from '@mantine/core';
import { memo, type FC } from 'react';
import FieldSelect from '../../common/FieldSelect';
import { isFunnelVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigFunnel';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { Config } from '../common/Config';
import { themeOverride } from '../mantineTheme';
import { StepConfig } from './StepConfig';

export const ConfigTabs: FC = memo(() => {
    const { visualizationConfig } = useVisualizationContext();

    if (!isFunnelVisualizationConfig(visualizationConfig)) return null;

    const numericFields = Object.values(visualizationConfig.numericFields);
    // TODO: dimensions should be selectable for labels
    // const dimensions = Object.values(visualizationConfig.dimensions);

    const {
        selectedField,
        onFieldChange,
        dataInput,
        setDataInput,
        labels,
        onLabelsChange,
        labelOverrides,
        onLabelOverridesChange,
        colorDefaults,
        colorOverrides,
        onColorOverridesChange,
        data,
        showLegend,
        toggleShowLegend,
        legendPosition,
        legendPositionChange,
    } = visualizationConfig.chartConfig;

    return (
        <MantineProvider inherit theme={themeOverride}>
            <Tabs defaultValue="general" keepMounted={false}>
                <Tabs.List mb="sm">
                    <Tabs.Tab px="sm" value="general">
                        General
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="steps">
                        Steps
                    </Tabs.Tab>
                    <Tabs.Tab px="sm" value="display">
                        Display
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="general">
                    <Stack>
                        <Config>
                            <Config.Section>
                                <Config.Heading>
                                    Data orientation
                                </Config.Heading>
                                <Group spacing="xs">
                                    <Config.Label>Steps are</Config.Label>
                                    <SegmentedControl
                                        value={dataInput}
                                        data={[
                                            {
                                                value: FunnelChartDataInput.COLUMN,
                                                label: 'rows',
                                            },
                                            {
                                                value: FunnelChartDataInput.ROW,
                                                label: 'columns',
                                            },
                                        ]}
                                        onChange={(value) =>
                                            setDataInput(
                                                value ===
                                                    FunnelChartDataInput.ROW
                                                    ? FunnelChartDataInput.ROW
                                                    : FunnelChartDataInput.COLUMN,
                                            )
                                        }
                                    />
                                </Group>
                            </Config.Section>
                        </Config>
                        <Config>
                            {dataInput === FunnelChartDataInput.COLUMN && (
                                <Config.Section>
                                    <Config.Heading>Data field</Config.Heading>

                                    <Tooltip
                                        variant="xs"
                                        disabled={
                                            numericFields &&
                                            numericFields.length > 0
                                        }
                                        label="You must select at least one numeric metric to create a pie chart"
                                    >
                                        <Box>
                                            <FieldSelect<
                                                Metric | TableCalculation
                                            >
                                                placeholder="Select metric"
                                                disabled={
                                                    numericFields.length === 0
                                                }
                                                item={selectedField}
                                                items={numericFields}
                                                onChange={(newField) => {
                                                    if (
                                                        newField &&
                                                        isField(newField)
                                                    )
                                                        onFieldChange(
                                                            getItemId(newField),
                                                        );
                                                    else if (
                                                        newField &&
                                                        isTableCalculation(
                                                            newField,
                                                        )
                                                    )
                                                        onFieldChange(
                                                            newField.name,
                                                        );
                                                    else onFieldChange(null);
                                                }}
                                                hasGrouping
                                            />
                                        </Box>
                                    </Tooltip>
                                </Config.Section>
                            )}
                        </Config>
                    </Stack>
                </Tabs.Panel>
                <Tabs.Panel value="steps">
                    <Stack>
                        <Config>
                            <Config.Section>
                                <Config.Heading>Labels</Config.Heading>

                                <Group spacing="xs" noWrap>
                                    <Config.Label>Position</Config.Label>
                                    <SegmentedControl
                                        value={labels?.position}
                                        data={[
                                            {
                                                value: FunnelChartLabelPosition.LEFT,
                                                label: 'Left',
                                            },

                                            {
                                                value: FunnelChartLabelPosition.INSIDE,
                                                label: 'Inside',
                                            },
                                            {
                                                value: FunnelChartLabelPosition.RIGHT,
                                                label: 'Right',
                                            },
                                            {
                                                value: FunnelChartLabelPosition.HIDDEN,
                                                label: 'Hidden',
                                            },
                                        ]}
                                        onChange={(
                                            newPosition: FunnelChartLabelPosition,
                                        ) =>
                                            onLabelsChange({
                                                position: newPosition,
                                            })
                                        }
                                    />
                                </Group>

                                <Group spacing="xs">
                                    <Checkbox
                                        checked={labels?.showValue}
                                        onChange={(newValue) =>
                                            onLabelsChange({
                                                showValue:
                                                    newValue.currentTarget
                                                        .checked,
                                            })
                                        }
                                        label="Show value"
                                    />

                                    <Checkbox
                                        checked={labels?.showPercentage}
                                        onChange={(newValue) =>
                                            onLabelsChange({
                                                showPercentage:
                                                    newValue.currentTarget
                                                        .checked,
                                            })
                                        }
                                        label="Show percentage"
                                    />
                                </Group>
                            </Config.Section>
                        </Config>
                        <Config>
                            <Config.Section>
                                <Config.Heading>Steps</Config.Heading>
                                {data
                                    .sort((a, b) => b.value - a.value)
                                    .map((step) => {
                                        return (
                                            <StepConfig
                                                key={step.name}
                                                defaultColor={
                                                    colorDefaults[step.name]
                                                }
                                                defaultLabel={step.name}
                                                swatches={[]}
                                                color={
                                                    colorOverrides[step.name]
                                                }
                                                label={
                                                    labelOverrides[step.name]
                                                }
                                                onColorChange={
                                                    onColorOverridesChange
                                                }
                                                onLabelChange={
                                                    onLabelOverridesChange
                                                }
                                            />
                                        );
                                    })}
                            </Config.Section>
                        </Config>
                    </Stack>
                </Tabs.Panel>
                <Tabs.Panel value="display">
                    <Stack>
                        <Config>
                            <Group>
                                <Config.Heading>Show legend</Config.Heading>
                                <Switch
                                    checked={showLegend}
                                    onChange={toggleShowLegend}
                                />
                            </Group>
                        </Config>

                        <Collapse in={showLegend}>
                            <Group spacing="xs">
                                <Config.Label>Orientation</Config.Label>
                                <SegmentedControl
                                    name="orient"
                                    value={legendPosition}
                                    onChange={(
                                        val: FunnelChartLegendPosition,
                                    ) => legendPositionChange(val)}
                                    data={[
                                        {
                                            value: FunnelChartLegendPosition.HORIZONTAL,
                                            label: 'Horizontal',
                                        },
                                        {
                                            value: FunnelChartLegendPosition.VERTICAL,
                                            label: 'Vertical',
                                        },
                                    ]}
                                />
                            </Group>
                        </Collapse>
                    </Stack>
                </Tabs.Panel>
            </Tabs>
        </MantineProvider>
    );
});
