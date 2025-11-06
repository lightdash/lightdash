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
import {
    Box,
    Grid,
    Group,
    NumberInput,
    Stack,
    Switch,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';
import { isTreemapVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import FieldSelect from '../../common/FieldSelect';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';
import { DraggablePortalHandler } from './DraggablePortalHandler';

import { GrabIcon } from '../common/GrabIcon';
import classes from './DndList.module.css';

export const Layout: React.FC = () => {
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    if (!isTreemapVisualizationConfig(visualizationConfig)) return null;

    const numericMetrics = Object.values(visualizationConfig.numericMetrics);

    const {
        groupFieldIds,
        groupReorder,

        selectedSizeMetric,
        sizeMetricChange,

        useDynamicColors,
        toggleDynamicColors,
        selectedColorMetric,
        colorMetricChange,
        startColor,
        endColor,
        onStartColorChange,
        onEndColorChange,
        startColorThreshold,
        setStartColorThreshold,
        endColorThreshold,
        setEndColorThreshold,
    } = visualizationConfig.chartConfig;

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
                                      noWrap
                                      spacing="xs"
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      className={`${classes.item} ${
                                          snapshot.isDragging
                                              ? classes.itemDragging
                                              : ''
                                      }`}
                                      style={{
                                          ...provided.draggableProps.style,
                                      }}
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
                    <Group spacing="xs">
                        <Config.Heading>Dimension hierarchy</Config.Heading>
                        <Tooltip
                            withinPortal={true}
                            maw={350}
                            variant="xs"
                            multiline
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
                    <Group spacing="xs">
                        <Config.Heading>Size metric</Config.Heading>
                        <Tooltip
                            withinPortal={true}
                            maw={350}
                            variant="xs"
                            multiline
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
                    <Group spacing="xs">
                        <Config.Heading>Color metric</Config.Heading>
                        <Tooltip
                            withinPortal={true}
                            maw={350}
                            variant="xs"
                            multiline
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
                            checked={useDynamicColors}
                            onChange={toggleDynamicColors}
                        />
                    </Group>
                    {useDynamicColors ? (
                        <Stack spacing="xs">
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
                            <Grid align="center" gutter="xs">
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
                                    <Group spacing="xs" position="right">
                                        <Config.Label>Threshold</Config.Label>
                                        <NumberInput
                                            value={startColorThreshold}
                                            onChange={setStartColorThreshold}
                                            hideControls={true}
                                            precision={2}
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
                                        noWrap
                                        w="100%"
                                        spacing="xs"
                                        position="right"
                                    >
                                        <Config.Label>Threshold</Config.Label>
                                        <NumberInput
                                            value={endColorThreshold}
                                            onChange={setEndColorThreshold}
                                            hideControls={true}
                                            precision={2}
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
