import { Checkbox, Colors, FormGroup, Icon } from '@blueprintjs/core';
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
import { SectionTitle } from './TableConfig.styles';

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
};

const DroppableItemsList: FC<DroppableItemsListProps> = ({
    droppableId,
    itemIds,
    isDragging,
}) => {
    return (
        <Droppable droppableId={droppableId}>
            {(dropProps, droppableSnapshot) => (
                <div
                    {...dropProps.droppableProps}
                    ref={dropProps.innerRef}
                    style={{
                        background: droppableSnapshot.isDraggingOver
                            ? Colors.LIGHT_GRAY4
                            : isDragging
                            ? Colors.LIGHT_GRAY5
                            : undefined,
                    }}
                >
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
                                            margin: '0.357em 0',
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
    const { showToastPrimary, showToastError } = useToaster();
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
            } else {
                showToastPrimary({
                    title: 'Reordering rows is not supported yet',
                });
            }
        },
        [
            columns,
            handleToggleMetricsAsRows,
            metricsAsRows,
            rows,
            setPivotDimensions,
            showToastPrimary,
            showToastError,
        ],
    );

    return (
        <>
            <DragDropContext
                onDragStart={() => setIsDragging(true)}
                onDragEnd={onDragEnd}
            >
                <SectionTitle>Columns</SectionTitle>
                <FormGroup>
                    <DroppableItemsList
                        droppableId={DroppableIds.COLUMNS}
                        itemIds={columns}
                        isDragging={isDragging}
                    />
                </FormGroup>

                <SectionTitle>Rows</SectionTitle>
                <FormGroup>
                    <DroppableItemsList
                        droppableId={DroppableIds.ROWS}
                        itemIds={rows}
                        isDragging={isDragging}
                    />
                </FormGroup>
            </DragDropContext>

            <SectionTitle>Metrics</SectionTitle>
            <FormGroup>
                {metrics.map((itemId) => (
                    <div
                        key={itemId}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            width: '100%',
                            margin: '0.357em 0',
                        }}
                    >
                        <ColumnConfiguration fieldId={itemId} />
                    </div>
                ))}
            </FormGroup>
            <SectionTitle>Options</SectionTitle>
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

                {canUsePivotTable ? (
                    <Checkbox
                        label="Show metrics as rows"
                        checked={metricsAsRows}
                        onChange={() => handleToggleMetricsAsRows()}
                    />
                ) : null}

                {canUsePivotTable ? (
                    <Checkbox
                        label="Show row total"
                        checked={showRowCalculation}
                        onChange={() => {
                            setShowRowCalculation(!showRowCalculation);
                        }}
                    />
                ) : null}
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
