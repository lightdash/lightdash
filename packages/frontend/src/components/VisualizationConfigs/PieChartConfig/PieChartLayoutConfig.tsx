import {
    getItemId,
    isCustomDimension,
    isDimension,
    isField,
    isMetric,
    isNumericItem,
    isTableCalculation,
    type CustomDimension,
    type Dimension,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { Box, Group, Stack, SegmentedControl, Tooltip } from '@mantine/core';
import { useMemo } from 'react';
import FieldSelect from '../../common/FieldSelect';
import { isPieVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { AddButton } from '../common/AddButton';
import { Config } from '../common/Config';
import { useAddFieldsToQuery } from '../common/useAddFieldsToQuery';

export const Layout: React.FC = () => {
    const { visualizationConfig, itemsMap } = useVisualizationContext();
    const { addableItems, addFieldToQuery, isFieldPending } =
        useAddFieldsToQuery();

    const addableDimensions = useMemo(
        () =>
            addableItems.filter(
                (item): item is Dimension | CustomDimension =>
                    isDimension(item) || isCustomDimension(item),
            ),
        [addableItems],
    );

    const addableNumericMetrics = useMemo(
        () =>
            addableItems.filter(
                (item): item is Metric =>
                    isField(item) && isMetric(item) && isNumericItem(item),
            ),
        [addableItems],
    );

    if (!isPieVisualizationConfig(visualizationConfig)) return null;

    const numericMetrics = Object.values(visualizationConfig.numericMetrics);
    const dimensions = Object.values(visualizationConfig.dimensions);

    const {
        groupFieldIds,
        groupAdd,
        groupChange,
        groupRemove,

        metricId,
        selectedMetric,
        metricChange,

        isDonut,
        toggleDonut,
    } = visualizationConfig.chartConfig;

    const unusedAddableDimensions = addableDimensions.filter(
        (item) => !groupFieldIds.includes(getItemId(item)),
    );
    const hasAnyDimension =
        dimensions.length > 0 || addableDimensions.length > 0;
    const allDimensionsGrouped =
        groupFieldIds.length ===
        dimensions.length + unusedAddableDimensions.length;

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Group>
                        <Config.Heading>Groups</Config.Heading>
                        <Tooltip
                            disabled={
                                !(!hasAnyDimension || allDimensionsGrouped)
                            }
                            label={
                                !hasAnyDimension
                                    ? 'You must select at least one dimension to create a pie chart'
                                    : allDimensionsGrouped
                                      ? 'All dimensions are already used as groups'
                                      : undefined
                            }
                        >
                            <AddButton
                                onClick={() => {
                                    const hasUnusedInQueryDimension =
                                        dimensions.some(
                                            (item) =>
                                                !groupFieldIds.includes(
                                                    getItemId(item),
                                                ),
                                        );
                                    if (hasUnusedInQueryDimension) {
                                        groupAdd();
                                        return;
                                    }
                                    const nextDimension =
                                        unusedAddableDimensions[0];
                                    if (!nextDimension) return;
                                    addFieldToQuery(nextDimension);
                                    groupAdd(getItemId(nextDimension));
                                }}
                                disabled={
                                    !hasAnyDimension || allDimensionsGrouped
                                }
                            />
                        </Tooltip>
                    </Config.Group>

                    {groupFieldIds.map((dimensionId, index) => {
                        if (!dimensionId) return null;

                        const dimension = itemsMap?.[dimensionId];

                        const selectedDimension =
                            isDimension(dimension) ||
                            isCustomDimension(dimension)
                                ? dimension
                                : addableDimensions.find(
                                      (item) => getItemId(item) === dimensionId,
                                  );
                        return (
                            <FieldSelect<CustomDimension | Dimension>
                                key={index}
                                disabled={!hasAnyDimension}
                                clearable={index !== 0}
                                placeholder="Select dimension"
                                item={selectedDimension}
                                items={dimensions}
                                addItems={addableDimensions}
                                loading={isFieldPending(dimensionId)}
                                inactiveItemIds={groupFieldIds
                                    .filter((id): id is string => !!id)
                                    .filter((id) => id !== dimensionId)}
                                onChange={(newField) => {
                                    if (!dimensionId) return;

                                    if (newField) {
                                        const newFieldId = getItemId(newField);
                                        if (newFieldId !== dimensionId) {
                                            if (
                                                !dimensions.some(
                                                    (item) =>
                                                        getItemId(item) ===
                                                        newFieldId,
                                                )
                                            ) {
                                                addFieldToQuery(newField);
                                            }
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
                        disabled={
                            numericMetrics.length > 0 ||
                            addableNumericMetrics.length > 0
                        }
                        label="You must select at least one numeric metric to create a pie chart"
                    >
                        <Box>
                            <FieldSelect<Metric | TableCalculation>
                                placeholder="Select metric"
                                disabled={
                                    numericMetrics.length === 0 &&
                                    addableNumericMetrics.length === 0
                                }
                                item={
                                    selectedMetric ??
                                    addableNumericMetrics.find(
                                        (item) => getItemId(item) === metricId,
                                    )
                                }
                                items={numericMetrics}
                                addItems={addableNumericMetrics}
                                loading={isFieldPending(metricId)}
                                onChange={(newField) => {
                                    if (
                                        newField &&
                                        !numericMetrics.some(
                                            (item) =>
                                                getItemId(item) ===
                                                getItemId(newField),
                                        )
                                    ) {
                                        addFieldToQuery(newField);
                                    }
                                    if (newField && isField(newField))
                                        metricChange(getItemId(newField));
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

            <Group gap="xs">
                <Config.Label>Display as</Config.Label>
                <SegmentedControl
                    size="xs"
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
