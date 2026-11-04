import {
    FunnelChartDataInput,
    FunnelChartLabelPosition,
    FunnelChartLegendPosition,
    getGranularityMapFromItems,
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
    Stack,
    SegmentedControl,
    Switch,
    Tooltip,
} from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import {
    selectFunnelColorDefaults,
    selectFunnelData,
    selectFunnelEditor,
    selectFunnelFieldPools,
    selectFunnelSelectedField,
    useVisualizationSelector,
} from '../../../features/visualization/store';
import { useFunnelEditorActions } from '../../../hooks/useFunnelChartConfig';
import FieldSelect from '../../common/FieldSelect';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
} from '../../LightdashVisualization/useVisualizationContext';
import { ColorPaletteSection } from '../common/ColorPaletteSection';
import { Config } from '../common/Config';
import { VisualizationConfigTabs } from '../common/VisualizationConfigTabs';
import { StepConfig } from './StepConfig';

export const ConfigTabs: FC = memo(() => {
    const { itemsMap } = useVisualizationInputs();
    const granularityFields = useMemo(
        () => Object.keys(getGranularityMapFromItems(itemsMap)),
        [itemsMap],
    );
    const pools = useVisualizationInputSelector(selectFunnelFieldPools);
    const numericFields = Object.values(pools.numericFields);
    // TODO: dimensions should be selectable for labels

    const selectedField = useVisualizationInputSelector(
        selectFunnelSelectedField,
    );
    const data = useVisualizationInputSelector(selectFunnelData);
    const colorDefaults = useVisualizationInputSelector(
        selectFunnelColorDefaults,
    );
    const dataInput = useVisualizationSelector(
        (state) => selectFunnelEditor(state).dataInput,
    );
    const labels = useVisualizationSelector(
        (state) => selectFunnelEditor(state).labels,
    );
    const labelOverrides = useVisualizationSelector(
        (state) => selectFunnelEditor(state).labelOverrides,
    );
    const colorOverrides = useVisualizationSelector(
        (state) => selectFunnelEditor(state).colorOverrides,
    );
    const showLegend = useVisualizationSelector(
        (state) => selectFunnelEditor(state).showLegend,
    );
    const legendPosition = useVisualizationSelector(
        (state) => selectFunnelEditor(state).legendPosition,
    );
    const {
        onFieldChange,
        setDataInput,
        onLabelsChange,
        onLabelOverridesChange,
        onColorOverridesChange,
        toggleShowLegend,
        legendPositionChange,
    } = useFunnelEditorActions();

    // Match the rendered step order: query order when steps come from rows,
    // descending taper otherwise
    const orderedSteps =
        dataInput === FunnelChartDataInput.COLUMN
            ? data
            : [...data].sort((a, b) => b.value - a.value);

    return (
        <VisualizationConfigTabs
            tabs={[
                {
                    value: 'general',
                    label: 'General',
                    panel: (
                        <Stack>
                            <Config>
                                <Config.Section>
                                    <Config.Heading>
                                        Data orientation
                                    </Config.Heading>
                                    <Group gap="xs">
                                        <Config.Label>Steps are</Config.Label>
                                        <SegmentedControl
                                            size="xs"
                                            value={dataInput}
                                            data={[
                                                {
                                                    value: FunnelChartDataInput.COLUMN,
                                                    label: 'Rows',
                                                },
                                                {
                                                    value: FunnelChartDataInput.ROW,
                                                    label: 'Columns',
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
                                        <Config.Heading>
                                            Data field
                                        </Config.Heading>

                                        <Tooltip
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
                                                        numericFields.length ===
                                                        0
                                                    }
                                                    item={selectedField}
                                                    items={numericFields}
                                                    onChange={(newField) => {
                                                        if (
                                                            newField &&
                                                            isField(newField)
                                                        )
                                                            onFieldChange(
                                                                getItemId(
                                                                    newField,
                                                                ),
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
                                                        else
                                                            onFieldChange(null);
                                                    }}
                                                    hasGrouping
                                                />
                                            </Box>
                                        </Tooltip>
                                    </Config.Section>
                                )}
                            </Config>
                        </Stack>
                    ),
                },
                {
                    value: 'steps',
                    label: 'Steps',
                    panel: (
                        <Stack>
                            <ColorPaletteSection />
                            <Config>
                                <Config.Section>
                                    <Config.Heading>Labels</Config.Heading>

                                    <Group gap="xs" wrap="nowrap">
                                        <Config.Label>Position</Config.Label>
                                        <SegmentedControl
                                            size="xs"
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
                                            onChange={(newPosition) =>
                                                onLabelsChange({
                                                    position:
                                                        newPosition as FunnelChartLabelPosition,
                                                })
                                            }
                                        />
                                    </Group>

                                    <Group gap="xs">
                                        <Checkbox
                                            size="xs"
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
                                            size="xs"
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
                                    {orderedSteps.map((step) => {
                                        return (
                                            <StepConfig
                                                key={step.id}
                                                id={step.id}
                                                defaultColor={
                                                    colorDefaults[step.id]
                                                }
                                                defaultLabel={step.name}
                                                swatches={[]}
                                                color={colorOverrides[step.id]}
                                                label={labelOverrides[step.id]}
                                                granularityFields={
                                                    granularityFields
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
                    ),
                },
                {
                    value: 'display',
                    label: 'Display',
                    panel: (
                        <Stack>
                            <Config>
                                <Group>
                                    <Config.Heading>Show legend</Config.Heading>
                                    <Switch
                                        size="xs"
                                        checked={showLegend}
                                        onChange={toggleShowLegend}
                                    />
                                </Group>
                            </Config>

                            <Collapse expanded={showLegend}>
                                <Group gap="xs">
                                    <Config.Label>Orientation</Config.Label>
                                    <SegmentedControl
                                        size="xs"
                                        name="orient"
                                        value={legendPosition}
                                        onChange={(value) =>
                                            legendPositionChange(
                                                value as FunnelChartLegendPosition,
                                            )
                                        }
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
                    ),
                },
            ]}
        />
    );
});
