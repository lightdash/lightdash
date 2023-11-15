import {
    fieldId,
    getCustomDimensionId,
    isCustomDimension,
    isField,
} from '@lightdash/common';
import { Box, Button, Stack, Switch, Tooltip } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import FieldSelect from '../../common/FieldSelect';
import MantineIcon from '../../common/MantineIcon';
import { isPieVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigPie';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';

const PieChartLayoutConfig: React.FC = () => {
    const {
        dimensions,
        allNumericMetrics,
        customDimensions,
        visualizationConfig,
    } = useVisualizationContext();

    if (!isPieVisualizationConfig(visualizationConfig)) return null;

    const allDimensions = [...dimensions, ...customDimensions];

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
                    const selectedDimension = allDimensions.find(
                        (d) =>
                            (isCustomDimension(d)
                                ? getCustomDimensionId(d)
                                : fieldId(d)) === dimensionId,
                    );

                    return (
                        <FieldSelect
                            key={index}
                            disabled={allDimensions.length === 0}
                            clearable={index !== 0}
                            label={index === 0 ? 'Group' : undefined}
                            placeholder="Select dimension"
                            item={selectedDimension}
                            items={allDimensions}
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
                            allDimensions.length === 0 ||
                            groupFieldIds.length === allDimensions.length
                        )
                    }
                    label={
                        allDimensions.length === 0
                            ? 'You must select at least one dimension to create a pie chart'
                            : allDimensions.length === groupFieldIds.length
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
                                allDimensions.length === 0 ||
                                groupFieldIds.length === allDimensions.length
                            }
                        >
                            Add Group
                        </Button>
                    </Box>
                </Tooltip>
            </Stack>

            <Tooltip
                disabled={allNumericMetrics.length > 0}
                label="You must select at least one numeric metric to create a pie chart"
            >
                <Box>
                    <FieldSelect
                        label="Metric"
                        placeholder="Select metric"
                        disabled={allNumericMetrics.length === 0}
                        item={selectedMetric}
                        items={allNumericMetrics}
                        onChange={(newField) => {
                            metricChange(
                                newField && isField(newField)
                                    ? fieldId(newField)
                                    : null,
                            );
                        }}
                    />
                </Box>
            </Tooltip>

            <Switch label="Donut" checked={isDonut} onChange={toggleDonut} />
        </Stack>
    );
};

export default PieChartLayoutConfig;
