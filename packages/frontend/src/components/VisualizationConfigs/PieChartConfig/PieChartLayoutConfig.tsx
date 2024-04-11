import {
    fieldId,
    getCustomDimensionId,
    isCustomDimension,
    isDimension,
    isField,
    isTableCalculation,
    type CustomDimension,
    type Dimension,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { Box, Group, SegmentedControl, Stack, Tooltip } from '@mantine/core';
import FieldSelect from '../../common/FieldSelect';
import { isPieVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigPie';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { AddButton } from '../common/AddButton';
import { Config } from '../common/Config';

export const Layout: React.FC = () => {
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    if (!isPieVisualizationConfig(visualizationConfig)) return null;

    const numericMetrics = Object.values(visualizationConfig.numericMetrics);
    const dimensions = Object.values(visualizationConfig.dimensions);

    const {
        groupFieldIds,
        groupAdd,
        groupChange,
        groupRemove,

        selectedMetric,
        metricChange,

        isDonut,
        toggleDonut,
    } = visualizationConfig.chartConfig;

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Group>
                        <Config.Heading>Groups</Config.Heading>
                        <Tooltip
                            variant="xs"
                            disabled={
                                !(
                                    dimensions.length === 0 ||
                                    groupFieldIds.length === dimensions.length
                                )
                            }
                            label={
                                dimensions.length === 0
                                    ? 'You must select at least one dimension to create a pie chart'
                                    : dimensions.length === groupFieldIds.length
                                    ? 'To add more groups you need to add more dimensions to your query'
                                    : undefined
                            }
                            withinPortal
                        >
                            <AddButton
                                onClick={groupAdd}
                                disabled={
                                    dimensions.length === 0 ||
                                    groupFieldIds.length === dimensions.length
                                }
                            />
                        </Tooltip>
                    </Config.Group>

                    {groupFieldIds.map((dimensionId, index) => {
                        if (!itemsMap || !dimensionId) return null;

                        const dimension = itemsMap[dimensionId];

                        const selectedDimension =
                            isDimension(dimension) ||
                            isCustomDimension(dimension)
                                ? dimension
                                : undefined;
                        return (
                            <FieldSelect<CustomDimension | Dimension>
                                key={index}
                                disabled={dimensions.length === 0}
                                clearable={index !== 0}
                                placeholder="Select dimension"
                                item={selectedDimension}
                                items={dimensions}
                                inactiveItemIds={groupFieldIds
                                    .filter((id): id is string => !!id)
                                    .filter((id) => id !== dimensionId)}
                                onChange={(newField) => {
                                    if (!dimensionId) return;

                                    if (newField) {
                                        const newFieldId = isCustomDimension(
                                            newField,
                                        )
                                            ? getCustomDimensionId(newField)
                                            : fieldId(newField);
                                        if (newFieldId !== dimensionId) {
                                            groupChange(
                                                dimensionId,
                                                newFieldId,
                                            );
                                        }
                                    } else {
                                        groupRemove(dimensionId);
                                    }
                                }}
                                hasGrouping
                            />
                        );
                    })}
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Config.Heading>Metric</Config.Heading>

                    <Tooltip
                        variant="xs"
                        disabled={numericMetrics && numericMetrics.length > 0}
                        label="You must select at least one numeric metric to create a pie chart"
                    >
                        <Box>
                            <FieldSelect<Metric | TableCalculation>
                                placeholder="Select metric"
                                disabled={numericMetrics.length === 0}
                                item={selectedMetric}
                                items={numericMetrics}
                                onChange={(newField) => {
                                    if (newField && isField(newField))
                                        metricChange(fieldId(newField));
                                    else if (
                                        newField &&
                                        isTableCalculation(newField)
                                    )
                                        metricChange(newField.name);
                                    else metricChange(null);
                                }}
                                hasGrouping
                            />
                        </Box>
                    </Tooltip>
                </Config.Section>
            </Config>

            <Group spacing="xs">
                <Config.Label>Display as</Config.Label>
                <SegmentedControl
                    value={isDonut ? 'donut' : 'pie'}
                    data={[
                        { value: 'pie', label: 'Pie' },
                        { value: 'donut', label: 'Donut' },
                    ]}
                    onChange={() => toggleDonut()}
                />
            </Group>
        </Stack>
    );
};
