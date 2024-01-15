import {
    CustomDimension,
    Dimension,
    fieldId,
    getCustomDimensionId,
    isCustomDimension,
    isDimension,
    isField,
    isTableCalculation,
    Metric,
    TableCalculation,
} from '@lightdash/common';
import { Box, Button, Stack, Switch, Tooltip } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import FieldSelect from '../../common/FieldSelect';
import MantineIcon from '../../common/MantineIcon';
import { isPieVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigPie';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';

const PieChartLayoutConfig: React.FC = () => {
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
            <Stack spacing="xs">
                {groupFieldIds.map((dimensionId, index) => {
                    if (!itemsMap || !dimensionId) return null;

                    const dimension = itemsMap[dimensionId];

                    const selectedDimension =
                        isDimension(dimension) || isCustomDimension(dimension)
                            ? dimension
                            : undefined;
                    return (
                        <FieldSelect<CustomDimension | Dimension>
                            key={index}
                            disabled={dimensions.length === 0}
                            clearable={index !== 0}
                            label={index === 0 ? 'Group' : undefined}
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
                                        groupChange(dimensionId, newFieldId);
                                    }
                                } else {
                                    groupRemove(dimensionId);
                                }
                            }}
                        />
                    );
                })}

                <Tooltip
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
                    <Box w="fit-content">
                        <Button
                            w="fit-content"
                            size="xs"
                            leftIcon={<MantineIcon icon={IconPlus} />}
                            variant="outline"
                            onClick={groupAdd}
                            disabled={
                                dimensions.length === 0 ||
                                groupFieldIds.length === dimensions.length
                            }
                        >
                            Add Group
                        </Button>
                    </Box>
                </Tooltip>
            </Stack>

            <Tooltip
                disabled={numericMetrics && numericMetrics.length > 0}
                label="You must select at least one numeric metric to create a pie chart"
            >
                <Box>
                    <FieldSelect<Metric | TableCalculation>
                        label="Metric"
                        placeholder="Select metric"
                        disabled={numericMetrics.length === 0}
                        item={selectedMetric}
                        items={numericMetrics}
                        onChange={(newField) => {
                            if (newField && isField(newField))
                                metricChange(fieldId(newField));
                            else if (newField && isTableCalculation(newField))
                                metricChange(newField.name);
                            else metricChange(null);
                        }}
                    />
                </Box>
            </Tooltip>

            <Switch label="Donut" checked={isDonut} onChange={toggleDonut} />
        </Stack>
    );
};

export default PieChartLayoutConfig;
