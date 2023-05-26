import { Checkbox, Colors, FormGroup, Icon } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { Text, Title } from '@mantine/core';
import React, { FC, useCallback, useMemo, useState } from 'react';
import {
    DragDropContext,
    Draggable,
    DraggableStateSnapshot,
    Droppable,
    DropResult,
} from 'react-beautiful-dnd';
import { createPortal } from 'react-dom';
import useToaster from '../../hooks/toaster/useToaster';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { Spacer } from '../SortButton/SortButton.styles';
import ColumnConfiguration from './ColumnConfiguration';

export const MAX_PIVOTS = 3;

type DraggablePortalHandlerProps = {
    snapshot: DraggableStateSnapshot;
};

const DraggablePortalHandler: FC<DraggablePortalHandlerProps> = ({
    children,
    snapshot,
}) => {
    if (snapshot.isDragging) return createPortal(children, document.body);
    return <>{children}</>;
};

enum DroppableIds {
    COLUMNS = 'COLUMNS',
    ROWS = 'ROWS',
}

type DroppableItemsListProps = {
    droppableId: string;
    itemIds: string[];
    isDragging: boolean;
    disableReorder: boolean;
    placeholder?: string;
};

const DroppableItemsList: FC<DroppableItemsListProps> = ({
    droppableId,
    itemIds,
    isDragging,
    disableReorder,
    placeholder,
}) => {
    return (
        <Droppable droppableId={droppableId}>
            {(dropProps, droppableSnapshot) => (
                <div
                    {...dropProps.droppableProps}
                    ref={dropProps.innerRef}
                    style={{
                        minHeight: isDragging ? '30px' : undefined,
                        margin: '7px 0',
                        background: droppableSnapshot.isDraggingOver
                            ? Colors.LIGHT_GRAY4
                            : isDragging
                            ? Colors.LIGHT_GRAY5
                            : undefined,
                    }}
                >
                    {!isDragging && itemIds.length <= 0 ? (
                        <Text size="xs" color="gray.6" m="xs" ta="center">
                            {placeholder}
                        </Text>
                    ) : null}
                    {itemIds.map((itemId, index) => (
                        <Draggable
                            key={itemId}
                            draggableId={itemId}
                            index={index}
                        >
                            {(
                                { draggableProps, dragHandleProps, innerRef },
                                snapshot,
                            ) => (
                                <DraggablePortalHandler snapshot={snapshot}>
                                    <div
                                        ref={innerRef}
                                        {...draggableProps}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            width: '100%',
                                            marginBottom: '10px',
                                            visibility:
                                                isDragging &&
                                                disableReorder &&
                                                !snapshot.isDragging
                                                    ? 'hidden'
                                                    : undefined,
                                            ...draggableProps.style,
                                        }}
                                    >
                                        <Icon
                                            tagName="div"
                                            icon="drag-handle-vertical"
                                            {...dragHandleProps}
                                        />
                                        <Spacer $width={6} />
                                        <ColumnConfiguration fieldId={itemId} />
                                    </div>
                                </DraggablePortalHandler>
                            )}
                        </Draggable>
                    ))}
                    {dropProps.placeholder}
                </div>
            )}
        </Droppable>
    );
};

const GeneralSettings: FC = () => {
    const {
        resultsData,
        pivotDimensions,
        tableConfig: {
            selectedItemIds,
            showTableNames,
            setShowTableNames,
            hideRowNumbers,
            setHideRowNumbers,
            showColumnCalculation,
            setShowColumnCalculation,
            showRowCalculation,
            setShowRowCalculation,
            metricsAsRows,
            setMetricsAsRows,
            canUsePivotTable,
        },
        setPivotDimensions,
    } = useVisualizationContext();
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const { showToastError } = useToaster();
    const {
        metricQuery: { dimensions },
    } = resultsData || { metricQuery: { dimensions: [] as string[] } };

    const {
        columns,
        rows,
        metrics,
    }: { columns: string[]; rows: string[]; metrics: string[] } =
        useMemo(() => {
            const columnFields = pivotDimensions ?? [];
            const rowsFields = dimensions?.filter(
                (itemId) => !pivotDimensions?.includes(itemId),
            );
            const metricsFields = (selectedItemIds ?? []).filter(
                (id) => ![...columnFields, ...rowsFields].includes(id),
            );
            return {
                columns: columnFields,
                rows: rowsFields,
                metrics: metricsFields,
            };
        }, [pivotDimensions, dimensions, selectedItemIds]);

    const handleToggleMetricsAsRows = useCallback(() => {
        const newValue = !metricsAsRows;

        if (newValue) {
            setShowColumnCalculation(showRowCalculation);
            setShowRowCalculation(showColumnCalculation);
        } else {
            setShowColumnCalculation(showRowCalculation);
            setShowRowCalculation(showColumnCalculation);
        }

        setMetricsAsRows(newValue);
    }, [
        metricsAsRows,
        setMetricsAsRows,
        showColumnCalculation,
        setShowColumnCalculation,
        showRowCalculation,
        setShowRowCalculation,
    ]);

    const onDragEnd = useCallback(
        ({ source, destination }: DropResult) => {
            setIsDragging(false);
            if (!destination) return;

            if (source.droppableId !== destination.droppableId) {
                if (destination.droppableId === DroppableIds.COLUMNS) {
                    if (columns.length >= MAX_PIVOTS) {
                        showToastError({
                            title: 'Maximum number of pivots reached',
                        });
                        return;
                    }
                    // Add pivot
                    const fieldId = rows[source.index];
                    setPivotDimensions([
                        ...columns.slice(0, destination.index),
                        fieldId,
                        ...columns.slice(destination.index),
                    ]);
                } else {
                    // Remove pivot
                    const fieldId = columns[source.index];
                    const newPivotDimensions = columns.filter(
                        (key) => key !== fieldId,
                    );

                    if (
                        metricsAsRows &&
                        (!newPivotDimensions || newPivotDimensions.length === 0)
                    ) {
                        handleToggleMetricsAsRows();
                    }
                    setPivotDimensions(newPivotDimensions);
                }
            } else if (destination.droppableId === DroppableIds.COLUMNS) {
                // Reorder pivot
                const fieldId = columns[source.index];
                const columnsWithoutReorderField = columns.filter(
                    (key) => key !== fieldId,
                );
                setPivotDimensions([
                    ...columnsWithoutReorderField.slice(0, destination.index),
                    fieldId,
                    ...columnsWithoutReorderField.slice(destination.index),
                ]);
            }
        },
        [
            columns,
            handleToggleMetricsAsRows,
            metricsAsRows,
            rows,
            setPivotDimensions,
            showToastError,
        ],
    );

    return (
        <>
            <DragDropContext
                onDragStart={() => setIsDragging(true)}
                onDragEnd={onDragEnd}
            >
                <Title order={6}>Columns</Title>
                <DroppableItemsList
                    droppableId={DroppableIds.COLUMNS}
                    itemIds={columns}
                    isDragging={isDragging}
                    disableReorder={false}
                    placeholder={
                        'Move dimensions to columns to pivot your table'
                    }
                />
                <Title order={6}>Rows</Title>
                <DroppableItemsList
                    droppableId={DroppableIds.ROWS}
                    itemIds={rows}
                    isDragging={isDragging}
                    disableReorder={true}
                />
            </DragDropContext>

            <Title order={6}>Metrics</Title>
            <Tooltip2
                disabled={!!canUsePivotTable}
                content={'to use metrics as rows, you need to pivot your table'}
                position="top"
            >
                <Checkbox
                    disabled={!canUsePivotTable}
                    label="Show metrics as rows"
                    checked={metricsAsRows}
                    onChange={() => handleToggleMetricsAsRows()}
                />
            </Tooltip2>
            <FormGroup>
                {metrics.map((itemId) => (
                    <div
                        key={itemId}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            width: '100%',
                            marginBottom: '10px',
                        }}
                    >
                        <ColumnConfiguration fieldId={itemId} />
                    </div>
                ))}
            </FormGroup>
            <Title order={6}>Options</Title>
            <FormGroup>
                <Checkbox
                    label="Show table names"
                    checked={showTableNames}
                    onChange={() => {
                        setShowTableNames(!showTableNames);
                    }}
                />

                <Checkbox
                    label="Show row numbers"
                    checked={!hideRowNumbers}
                    onChange={() => {
                        setHideRowNumbers(!hideRowNumbers);
                    }}
                />
                <Tooltip2
                    disabled={!!canUsePivotTable}
                    content={'to use rows totals, you need to pivot your table'}
                    position="top"
                >
                    <Checkbox
                        disabled={!canUsePivotTable}
                        label="Show row total"
                        checked={showRowCalculation}
                        onChange={() => {
                            setShowRowCalculation(!showRowCalculation);
                        }}
                    />
                </Tooltip2>
                <Checkbox
                    label="Show column total"
                    checked={showColumnCalculation}
                    onChange={() => {
                        setShowColumnCalculation(!showColumnCalculation);
                    }}
                />
            </FormGroup>
        </>
    );
};

export default GeneralSettings;
