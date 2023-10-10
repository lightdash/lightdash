import { fieldId, getItemId } from '@lightdash/common';
import { Box, Button, Stack, Switch, Tooltip } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import ItemSelect from '../../common/ItemSelect';
import MantineIcon from '../../common/MantineIcon';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';

const PieChartLayoutConfig: React.FC = () => {
    const {
        dimensions,
        allNumericMetrics,
        pieChartConfig: {
            groupFieldIds,
            groupAdd,
            groupChange,
            groupRemove,

            selectedMetric,
            metricChange,

            isDonut,
            toggleDonut,
        },
    } = useVisualizationContext();

    return (
        <Stack>
            <Stack spacing="xs">
                {groupFieldIds.map((dimensionId, index) => {
                    const selectedDimension = dimensions.find(
                        (d) => fieldId(d) === dimensionId,
                    );

                    return (
                        <ItemSelect
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
                            onChange={(newItem) => {
                                if (!dimensionId) return;

                                if (newItem) {
                                    const newItemId = getItemId(newItem);
                                    if (newItemId !== dimensionId) {
                                        groupChange(dimensionId, newItemId);
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
                disabled={allNumericMetrics.length > 0}
                label="You must select at least one numeric metric to create a pie chart"
            >
                <Box>
                    <ItemSelect
                        label="Metric"
                        placeholder="Select metric"
                        disabled={allNumericMetrics.length === 0}
                        item={selectedMetric}
                        items={allNumericMetrics}
                        onChange={(newItem) => {
                            metricChange(newItem ? getItemId(newItem) : null);
                        }}
                    />
                </Box>
            </Tooltip>

            <Switch label="Donut" checked={isDonut} onChange={toggleDonut} />
        </Stack>
    );
};

export default PieChartLayoutConfig;
