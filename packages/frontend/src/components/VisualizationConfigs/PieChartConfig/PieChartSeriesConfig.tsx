import {
    DragDropContext,
    Draggable,
    Droppable,
    type DropResult,
} from '@hello-pangea/dnd';
import {
    getGranularityMapFromItems,
    getReadableTextColor,
} from '@lightdash/common';
import { Box, Stack } from '@mantine/core';
import { useCallback, type FC } from 'react';
import {
    selectPieEditor,
    selectPieGroupColorDefaults,
    selectPieGroupFieldIds,
    selectPieSortedGroupLabels,
    selectPieValueOptionOverrideFlags,
    useVisualizationSelector,
} from '../../../features/visualization/store';
import { usePieEditorActions } from '../../../hooks/usePieChartConfig';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
} from '../../LightdashVisualization/useVisualizationContext';
import { ColorPaletteSection } from '../common/ColorPaletteSection';
import { Config } from '../common/Config';
import { GroupItem } from './GroupItem';
import classes from './PieChartSeriesConfig.module.css';
import { ValueOptions } from './ValueOptions';

export const Series: FC = () => {
    const { colorPalette, getGroupColor, itemsMap } = useVisualizationInputs();
    const groupFieldIds = useVisualizationInputSelector(selectPieGroupFieldIds);
    const sortedGroupLabels = useVisualizationInputSelector(
        selectPieSortedGroupLabels,
    );
    const groupColorDefaults = useVisualizationInputSelector(
        selectPieGroupColorDefaults,
    );
    const {
        isValueLabelOverriden,
        isShowValueOverriden,
        isShowPercentageOverriden,
    } = useVisualizationSelector(selectPieValueOptionOverrideFlags);
    const valueLabel = useVisualizationSelector(
        (state) => selectPieEditor(state).valueLabel,
    );
    const valueLabelColor = useVisualizationSelector(
        (state) => selectPieEditor(state).valueLabelColor,
    );
    const showValue = useVisualizationSelector(
        (state) => selectPieEditor(state).showValue,
    );
    const showPercentage = useVisualizationSelector(
        (state) => selectPieEditor(state).showPercentage,
    );
    const groupLabelOverrides = useVisualizationSelector(
        (state) => selectPieEditor(state).groupLabelOverrides,
    );
    const groupColorOverrides = useVisualizationSelector(
        (state) => selectPieEditor(state).groupColorOverrides,
    );
    const groupValueOptionOverrides = useVisualizationSelector(
        (state) => selectPieEditor(state).groupValueOptionOverrides,
    );
    const {
        groupSortChange,
        valueLabelChange,
        valueLabelColorChange,
        toggleShowValue,
        toggleShowPercentage,
        groupLabelChange,
        groupColorChange,
        groupValueOptionChange,
    } = usePieEditorActions();

    const granularityFields = Object.keys(getGranularityMapFromItems(itemsMap));

    const handleDragEnd = useCallback(
        (result: DropResult) => {
            if (!result.destination) return;
            if (result.source.index === result.destination.index) return;

            groupSortChange(result.source.index, result.destination.index);
        },
        [groupSortChange],
    );

    const firstGroupLabel = sortedGroupLabels[0];
    const firstGroupColor = firstGroupLabel
        ? (groupColorOverrides[firstGroupLabel] ??
          getGroupColor(groupFieldIds.join('_'), firstGroupLabel))
        : colorPalette[0];
    const automaticValueLabelColor =
        valueLabel === 'inside' && firstGroupColor
            ? getReadableTextColor(firstGroupColor)
            : firstGroupColor;

    return (
        <Stack>
            <ColorPaletteSection />
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
                        valueLabelColor={valueLabelColor}
                        defaultValueLabelColor={automaticValueLabelColor}
                        swatches={colorPalette}
                        onValueLabelColorChange={valueLabelColorChange}
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
                                                ? 'ldGray.1'
                                                : 'ldGray.0'
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
                                                            className={
                                                                draggableSnapshot.isDragging
                                                                    ? classes.draggingItem
                                                                    : undefined
                                                            }
                                                            // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
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
                                                            granularityFields={
                                                                granularityFields
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
                                                            valueLabelColor={
                                                                groupValueOptionOverrides[
                                                                    groupLabel
                                                                ]
                                                                    ?.valueLabelColor
                                                            }
                                                            defaultValueLabelColor={
                                                                valueLabelColor
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
