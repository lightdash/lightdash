import {
    DragDropContext,
    Draggable,
    Droppable,
    type DropResult,
} from '@hello-pangea/dnd';
import { Box, Stack } from '@mantine/core';
import { useCallback, type FC } from 'react';
import { isPieVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigPie';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { Config } from '../common/Config';
import { GroupItem } from './GroupItem';
import { ValueOptions } from './ValueOptions';

export const Series: FC = () => {
    const { visualizationConfig, colorPalette, getGroupColor } =
        useVisualizationContext();

    const isPieChartConfig = isPieVisualizationConfig(visualizationConfig);

    const handleDragEnd = useCallback(
        (result: DropResult) => {
            if (!isPieChartConfig) return;

            if (!result.destination) return;
            if (result.source.index === result.destination.index) return;

            visualizationConfig.chartConfig.groupSortChange(
                result.source.index,
                result.destination.index,
            );
        },
        [visualizationConfig, isPieChartConfig],
    );

    if (!isPieChartConfig) return null;

    const {
        groupFieldIds,
        valueLabel,
        valueLabelChange,
        showValue,
        toggleShowValue,
        showPercentage,
        toggleShowPercentage,
        isValueLabelOverriden,
        isShowValueOverriden,
        isShowPercentageOverriden,
        sortedGroupLabels,
        groupLabelOverrides,
        groupLabelChange,
        groupColorOverrides,
        groupColorDefaults,
        groupColorChange,
        groupValueOptionOverrides,
        groupValueOptionChange,
    } = visualizationConfig.chartConfig;

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Group>
                        <Config.Heading>Label</Config.Heading>
                    </Config.Group>
                    <ValueOptions
                        isValueLabelOverriden={isValueLabelOverriden}
                        isShowValueOverriden={isShowValueOverriden}
                        isShowPercentageOverriden={isShowPercentageOverriden}
                        valueLabel={valueLabel}
                        onValueLabelChange={valueLabelChange}
                        showValue={showValue}
                        onToggleShowValue={toggleShowValue}
                        showPercentage={showPercentage}
                        onToggleShowPercentage={toggleShowPercentage}
                    />
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Config.Group>
                        <Config.Heading>Series</Config.Heading>
                    </Config.Group>
                    {sortedGroupLabels.length === 0 ? null : (
                        <DragDropContext onDragEnd={handleDragEnd}>
                            <Droppable droppableId="droppable">
                                {(droppableProvided, droppableSnapshot) => (
                                    <Box
                                        ref={droppableProvided.innerRef}
                                        bg={
                                            droppableSnapshot.isDraggingOver
                                                ? 'gray.1'
                                                : 'gray.0'
                                        }
                                        p="xs"
                                    >
                                        {sortedGroupLabels.map(
                                            (groupLabel, index) => (
                                                <Draggable
                                                    key={groupLabel}
                                                    draggableId={groupLabel}
                                                    index={index}
                                                >
                                                    {(
                                                        draggableProvided,
                                                        draggableSnapshot,
                                                    ) => (
                                                        <GroupItem
                                                            ref={
                                                                draggableProvided.innerRef
                                                            }
                                                            {...draggableProvided.draggableProps}
                                                            style={{
                                                                ...draggableProvided
                                                                    .draggableProps
                                                                    .style,
                                                                top: 'auto',
                                                            }}
                                                            dragHandleProps={
                                                                draggableProvided.dragHandleProps
                                                            }
                                                            isOnlyItem={
                                                                sortedGroupLabels.length ===
                                                                1
                                                            }
                                                            sx={(theme) =>
                                                                draggableSnapshot.isDragging
                                                                    ? {
                                                                          backgroundColor:
                                                                              'white',
                                                                          borderRadius:
                                                                              theme
                                                                                  .radius
                                                                                  .sm,
                                                                          boxShadow:
                                                                              theme
                                                                                  .shadows
                                                                                  .sm,
                                                                      }
                                                                    : {}
                                                            }
                                                            swatches={
                                                                colorPalette
                                                            }
                                                            defaultColor={
                                                                groupColorDefaults[
                                                                    groupLabel
                                                                ]
                                                            }
                                                            defaultLabel={
                                                                groupLabel
                                                            }
                                                            color={
                                                                groupColorOverrides[
                                                                    groupLabel
                                                                ] ??
                                                                getGroupColor(
                                                                    groupFieldIds.join(
                                                                        '_',
                                                                    ),
                                                                    groupLabel,
                                                                )
                                                            }
                                                            label={
                                                                groupLabelOverrides[
                                                                    groupLabel
                                                                ]
                                                            }
                                                            valueLabel={
                                                                groupValueOptionOverrides[
                                                                    groupLabel
                                                                ]?.valueLabel ??
                                                                valueLabel
                                                            }
                                                            showValue={
                                                                groupValueOptionOverrides[
                                                                    groupLabel
                                                                ]?.showValue ??
                                                                showValue
                                                            }
                                                            showPercentage={
                                                                groupValueOptionOverrides[
                                                                    groupLabel
                                                                ]
                                                                    ?.showPercentage ??
                                                                showPercentage
                                                            }
                                                            onLabelChange={
                                                                groupLabelChange
                                                            }
                                                            onColorChange={
                                                                groupColorChange
                                                            }
                                                            onValueOptionsChange={
                                                                groupValueOptionChange
                                                            }
                                                        />
                                                    )}
                                                </Draggable>
                                            ),
                                        )}

                                        {droppableProvided.placeholder}
                                    </Box>
                                )}
                            </Droppable>
                        </DragDropContext>
                    )}
                </Config.Section>
            </Config>
        </Stack>
    );
};
