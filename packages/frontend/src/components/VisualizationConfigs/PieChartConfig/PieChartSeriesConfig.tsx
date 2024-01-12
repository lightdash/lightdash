import {
    PieChartValueLabel,
    PieChartValueLabels,
    PieChartValueOptions,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Checkbox,
    Collapse,
    Group,
    Select,
    Stack,
    StackProps,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronUp,
    IconGripVertical,
} from '@tabler/icons-react';
import { FC, forwardRef, useCallback } from 'react';
import {
    DragDropContext,
    Draggable,
    DraggableProvidedDragHandleProps,
    Droppable,
    DropResult,
} from 'react-beautiful-dnd';
import MantineIcon from '../../common/MantineIcon';
import { isPieVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigPie';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import ColorSelector from '../ColorSelector';

type ValueOptionsProps = {
    isValueLabelOverriden?: boolean;
    isShowValueOverriden?: boolean;
    isShowPercentageOverriden?: boolean;

    valueLabel: PieChartValueLabel;
    showValue: boolean;
    showPercentage: boolean;

    onValueLabelChange: (newValueLabel: PieChartValueLabel) => void;
    onToggleShowValue: (newValue: boolean) => void;
    onToggleShowPercentage: (newValue: boolean) => void;
};

const ValueOptions: FC<ValueOptionsProps> = ({
    isValueLabelOverriden = false,
    isShowValueOverriden = false,
    isShowPercentageOverriden = false,

    valueLabel,
    showValue,
    showPercentage,

    onValueLabelChange,
    onToggleShowValue,
    onToggleShowPercentage,
}) => (
    <>
        <Select
            label="Value label"
            value={isValueLabelOverriden ? 'mixed' : valueLabel}
            data={[
                ...(isValueLabelOverriden ? [['mixed', 'Mixed']] : []),
                ...Object.entries(PieChartValueLabels),
            ].map(([value, label]) => ({
                value,
                label,
                disabled: value === 'mixed',
            }))}
            onChange={(newValueLabel: PieChartValueLabel) => {
                onValueLabelChange(newValueLabel);
            }}
        />

        <Tooltip
            position="top-start"
            disabled={valueLabel !== 'hidden'}
            label="Enable Value label to configure this option"
            withinPortal
        >
            <div>
                <Checkbox
                    disabled={valueLabel === 'hidden'}
                    indeterminate={isShowValueOverriden}
                    checked={showValue}
                    onChange={(newValue) =>
                        onToggleShowValue(newValue.currentTarget.checked)
                    }
                    label="Show value"
                />
            </div>
        </Tooltip>

        <Tooltip
            position="top-start"
            disabled={valueLabel !== 'hidden'}
            label="Enable Value label to configure this option"
            withinPortal
        >
            <div>
                <Checkbox
                    disabled={valueLabel === 'hidden'}
                    indeterminate={isShowPercentageOverriden}
                    checked={showPercentage}
                    onChange={(newValue) =>
                        onToggleShowPercentage(newValue.currentTarget.checked)
                    }
                    label="Show percentage"
                />
            </div>
        </Tooltip>
    </>
);

type GroupItemProps = {
    isOnlyItem: boolean;

    dragHandleProps?: DraggableProvidedDragHandleProps;

    defaultColor: string;
    defaultLabel: string;

    swatches: string[];

    color: string | undefined;
    label: string | undefined;

    valueLabel: PieChartValueLabel;
    showValue: boolean;
    showPercentage: boolean;

    onColorChange: (label: string, newColor: string) => void;
    onLabelChange: (label: string, newLabel: string) => void;
    onValueOptionsChange: (
        label: string,
        newOptions: Partial<PieChartValueOptions>,
    ) => void;
};

const GroupItem = forwardRef<HTMLDivElement, StackProps & GroupItemProps>(
    (
        {
            isOnlyItem,

            dragHandleProps,

            defaultLabel,
            defaultColor,

            swatches,

            label,
            color,

            valueLabel,
            showValue,
            showPercentage,

            onColorChange,
            onLabelChange,
            onValueOptionsChange,

            ...rest
        },
        ref,
    ) => {
        const [opened, { toggle }] = useDisclosure();

        return (
            <Stack ref={ref} spacing="xs" {...rest}>
                <Group spacing="xs" px="xxs">
                    {!isOnlyItem && (
                        <Box
                            {...dragHandleProps}
                            sx={{
                                opacity: 0.6,
                                '&:hover': { opacity: 1 },
                            }}
                        >
                            <MantineIcon icon={IconGripVertical} />
                        </Box>
                    )}

                    <ColorSelector
                        color={color}
                        defaultColor={defaultColor}
                        swatches={swatches}
                        onColorChange={(newColor: string) =>
                            onColorChange(defaultLabel, newColor)
                        }
                    />

                    <TextInput
                        sx={{ flexGrow: 1 }}
                        placeholder={defaultLabel}
                        value={label}
                        onChange={(event) => {
                            onLabelChange(
                                defaultLabel,
                                event.currentTarget.value,
                            );
                        }}
                    />

                    <Tooltip label="Override value label options" withinPortal>
                        <ActionIcon onClick={toggle} size="sm">
                            <MantineIcon
                                icon={opened ? IconChevronUp : IconChevronDown}
                            />
                        </ActionIcon>
                    </Tooltip>
                </Group>

                <Collapse in={opened}>
                    <Stack pb="md" px="xxl" spacing="sm">
                        <ValueOptions
                            valueLabel={valueLabel}
                            onValueLabelChange={(newValue) =>
                                onValueOptionsChange(defaultLabel, {
                                    valueLabel: newValue,
                                })
                            }
                            showValue={showValue}
                            onToggleShowValue={(newValue) =>
                                onValueOptionsChange(defaultLabel, {
                                    showValue: newValue,
                                })
                            }
                            showPercentage={showPercentage}
                            onToggleShowPercentage={(newValue) =>
                                onValueOptionsChange(defaultLabel, {
                                    showPercentage: newValue,
                                })
                            }
                        />
                    </Stack>
                </Collapse>
            </Stack>
        );
    },
);

const PieChartSeriesConfig: FC = () => {
    const { visualizationConfig, colorPalette } = useVisualizationContext();

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
                                p="sm"
                                sx={(theme) => ({
                                    borderRadius: theme.radius.sm,
                                })}
                            >
                                {sortedGroupLabels.map((groupLabel, index) => (
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
                                                ref={draggableProvided.innerRef}
                                                {...draggableProvided.draggableProps}
                                                style={{
                                                    ...draggableProvided
                                                        .draggableProps.style,
                                                    top: 'auto',
                                                }}
                                                dragHandleProps={
                                                    draggableProvided.dragHandleProps
                                                }
                                                isOnlyItem={
                                                    sortedGroupLabels.length ===
                                                    1
                                                }
                                                py="xxs"
                                                sx={(theme) =>
                                                    draggableSnapshot.isDragging
                                                        ? {
                                                              backgroundColor:
                                                                  'white',
                                                              borderRadius:
                                                                  theme.radius
                                                                      .sm,
                                                              boxShadow:
                                                                  theme.shadows
                                                                      .sm,
                                                          }
                                                        : {}
                                                }
                                                swatches={colorPalette}
                                                defaultColor={
                                                    groupColorDefaults[
                                                        groupLabel
                                                    ]
                                                }
                                                defaultLabel={groupLabel}
                                                color={
                                                    groupColorOverrides[
                                                        groupLabel
                                                    ]
                                                }
                                                label={
                                                    groupLabelOverrides[
                                                        groupLabel
                                                    ]
                                                }
                                                valueLabel={
                                                    groupValueOptionOverrides[
                                                        groupLabel
                                                    ]?.valueLabel ?? valueLabel
                                                }
                                                showValue={
                                                    groupValueOptionOverrides[
                                                        groupLabel
                                                    ]?.showValue ?? showValue
                                                }
                                                showPercentage={
                                                    groupValueOptionOverrides[
                                                        groupLabel
                                                    ]?.showPercentage ??
                                                    showPercentage
                                                }
                                                onLabelChange={groupLabelChange}
                                                onColorChange={groupColorChange}
                                                onValueOptionsChange={
                                                    groupValueOptionChange
                                                }
                                            />
                                        )}
                                    </Draggable>
                                ))}

                                {droppableProvided.placeholder}
                            </Box>
                        )}
                    </Droppable>
                </DragDropContext>
            )}
        </Stack>
    );
};

export default PieChartSeriesConfig;
