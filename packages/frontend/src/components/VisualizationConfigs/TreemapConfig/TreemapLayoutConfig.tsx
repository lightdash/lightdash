import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import {
    ECHARTS_DEFAULT_COLORS,
    getItemId,
    getItemLabelWithoutTableName,
    isField,
    isTableCalculation,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { Box, Grid, Group, Stack, Switch, Text, Tooltip } from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';
import { useMemo } from 'react';
import {
    selectTreemapEditor,
    selectDimensionsAndNumericMetrics,
    selectTreemapGroupFieldIds,
    selectTreemapSelectedColorMetric,
    selectTreemapSelectedSizeMetric,
    useVisualizationSelector,
} from '../../../features/visualization/store';
import { useTreemapEditorActions } from '../../../hooks/useTreemapChartConfig';
import FieldSelect from '../../common/FieldSelect';
import MantineIcon from '../../common/MantineIcon';
import { NumberInput } from '../../common/NumberInput';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
} from '../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';
import { GrabIcon } from '../common/GrabIcon';
import classes from './DndList.module.css';
import { DraggablePortalHandler } from './DraggablePortalHandler';

export const Layout: React.FC = () => {
    const { itemsMap } = useVisualizationInputs();
    const pools = useVisualizationInputSelector(
        selectDimensionsAndNumericMetrics,
    );
    const groupFieldIds = useVisualizationInputSelector(
        selectTreemapGroupFieldIds,
    );
    const selectedSizeMetric = useVisualizationInputSelector(
        selectTreemapSelectedSizeMetric,
    );
    const selectedColorMetric = useVisualizationInputSelector(
        selectTreemapSelectedColorMetric,
    );
    const useDynamicColors = useVisualizationSelector(
        (state) => selectTreemapEditor(state).useDynamicColors,
    );
    const {
        groupReorder,
        sizeMetricChange,
        toggleDynamicColors,
        colorMetricChange,
        onStartColorChange,
        onEndColorChange,
        setStartColorThreshold,
        setEndColorThreshold,
    } = useTreemapEditorActions();
    const startColor = useVisualizationSelector(
        (state) => selectTreemapEditor(state).startColor,
    );
    const endColor = useVisualizationSelector(
        (state) => selectTreemapEditor(state).endColor,
    );
    const startColorThreshold = useVisualizationSelector(
        (state) => selectTreemapEditor(state).startColorThreshold,
    );
    const endColorThreshold = useVisualizationSelector(
        (state) => selectTreemapEditor(state).endColorThreshold,
    );

    const numericMetrics = useMemo(
        () => Object.values(pools.numericMetrics),
        [pools],
    );

    const orderedDimensions = !itemsMap
        ? null
        : groupFieldIds
              .filter((id) => id !== null && id !== undefined)
              .filter((id) => itemsMap[id])
              .map((dimensionId, index) => {
                  const dimension = itemsMap[dimensionId];

                  return (
                      <Draggable
                          key={dimensionId}
                          index={index}
                          draggableId={dimensionId}
                      >
                          {(provided, snapshot) => (
                              <DraggablePortalHandler snapshot={snapshot}>
                                  <Group
                                      wrap="nowrap"
                                      gap="xs"
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      className={`${classes.item} ${
                                          snapshot.isDragging
                                              ? classes.itemDragging
                                              : ''
                                      }`}
                                  >
                                      <Box className={classes.dragHandle}>
                                          <GrabIcon
                                              dragHandleProps={
                                                  provided.dragHandleProps
                                              }
                                          />
                                      </Box>
                                      <Text size="xs">
                                          {getItemLabelWithoutTableName(
                                              dimension,
                                          )}
                                      </Text>
                                  </Group>
                              </DraggablePortalHandler>
                          )}
                      </Draggable>
                  );
              });

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Group gap="xs">
                        <Config.Heading>Dimension hierarchy</Config.Heading>
                        <Tooltip
                            maw={350}
                            label="Drag and drop your dimensions to order them hierarchically."
                        >
                            <MantineIcon
                                icon={IconHelpCircle}
                                size="md"
                                display="inline"
                                color="gray"
                            />
                        </Tooltip>
                    </Group>
                    <DragDropContext
                        onDragEnd={({ destination, source }) => {
                            if (!destination) return;
                            groupReorder({
                                from: source.index,
                                to: destination.index,
                            });
                        }}
                    >
                        <Droppable droppableId="dnd-list" direction="vertical">
                            {(provided) => (
                                <div
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                >
                                    {orderedDimensions}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Group gap="xs">
                        <Config.Heading>Size metric</Config.Heading>
                        <Tooltip
                            maw={350}
                            label="Determines how large each block is."
                        >
                            <MantineIcon
                                icon={IconHelpCircle}
                                size="md"
                                display="inline"
                                color="gray"
                            />
                        </Tooltip>
                    </Group>
                    <Group>
                        <FieldSelect<Metric | TableCalculation>
                            placeholder="Select metric"
                            disabled={numericMetrics.length === 0}
                            item={selectedSizeMetric}
                            items={numericMetrics}
                            onChange={(newField) => {
                                if (newField && isField(newField))
                                    sizeMetricChange(getItemId(newField));
                                else if (
                                    newField &&
                                    isTableCalculation(newField)
                                )
                                    sizeMetricChange(newField.name);
                                else sizeMetricChange(null);
                            }}
                            hasGrouping
                        />
                    </Group>
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Group gap="xs">
                        <Config.Heading>Color metric</Config.Heading>
                        <Tooltip
                            maw={350}
                            label="Dynamically set the color of the nodes based on a metric. If not set, the treemap will use a default color scheme."
                        >
                            <MantineIcon
                                icon={IconHelpCircle}
                                size="md"
                                display="inline"
                                color="gray"
                            />
                        </Tooltip>
                        <Switch
                            size="xs"
                            checked={useDynamicColors}
                            onChange={toggleDynamicColors}
                        />
                    </Group>
                    {useDynamicColors ? (
                        <Stack gap="xs">
                            <FieldSelect<Metric | TableCalculation>
                                placeholder="Select metric"
                                disabled={numericMetrics.length === 0}
                                item={selectedColorMetric}
                                items={numericMetrics}
                                onChange={(newField) => {
                                    if (newField && isField(newField))
                                        colorMetricChange(getItemId(newField));
                                    else if (
                                        newField &&
                                        isTableCalculation(newField)
                                    )
                                        colorMetricChange(newField.name);
                                    else colorMetricChange(null);
                                }}
                                hasGrouping
                            />
                            <Grid align="center" gap="xs">
                                <Grid.Col span={3}>
                                    <Config.Label>Min color</Config.Label>
                                </Grid.Col>
                                <Grid.Col span={1}>
                                    <ColorSelector
                                        color={startColor}
                                        swatches={ECHARTS_DEFAULT_COLORS}
                                        withAlpha
                                        onColorChange={onStartColorChange}
                                    />
                                </Grid.Col>
                                <Grid.Col span={8}>
                                    <Group gap="xs" justify="flex-end">
                                        <Config.Label>Threshold</Config.Label>
                                        <NumberInput
                                            size="xs"
                                            value={startColorThreshold}
                                            onNumberChange={
                                                setStartColorThreshold
                                            }
                                            hideControls={true}
                                            decimalScale={2}
                                            fixedDecimalScale
                                            placeholder="Auto (per-level)"
                                        />
                                    </Group>
                                </Grid.Col>
                                <Grid.Col span={3}>
                                    <Config.Label>Max color</Config.Label>
                                </Grid.Col>
                                <Grid.Col span={1}>
                                    <ColorSelector
                                        color={endColor}
                                        swatches={ECHARTS_DEFAULT_COLORS}
                                        withAlpha
                                        onColorChange={onEndColorChange}
                                    />
                                </Grid.Col>
                                <Grid.Col span={8}>
                                    <Group
                                        wrap="nowrap"
                                        w="100%"
                                        gap="xs"
                                        justify="flex-end"
                                    >
                                        <Config.Label>Threshold</Config.Label>
                                        <NumberInput
                                            size="xs"
                                            value={endColorThreshold}
                                            onNumberChange={
                                                setEndColorThreshold
                                            }
                                            hideControls={true}
                                            decimalScale={2}
                                            fixedDecimalScale
                                            placeholder="Auto (per-level)"
                                        />
                                    </Group>
                                </Grid.Col>
                            </Grid>
                        </Stack>
                    ) : null}
                </Config.Section>
            </Config>
        </Stack>
    );
};
