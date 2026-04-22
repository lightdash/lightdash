import {
    DndContext,
    DragOverlay,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import { Group, Skeleton } from '@mantine-8/core';
import { useCallback, useMemo, useState, type FC, type ReactNode } from 'react';
import { useParams } from 'react-router';
import {
    DraggableItem,
    DroppableArea,
} from '../../../components/common/DndHelpers';
import Parameter from './Parameter';

type Props = {
    isEditMode: boolean;
    parameterValues: ParametersValuesMap;
    onParameterChange: (key: string, value: ParameterValue | null) => void;
    onClearAll: () => void;
    parameters?: ParameterDefinitions;
    missingRequiredParameters?: string[];
    pinnedParameters?: string[];
    onParameterPin?: (paramKey: string) => void;
    isLoading?: boolean;
    isError?: boolean;
    parameterOrder?: string[];
    onParameterReorder?: (order: string[]) => void;
    /** Separator element to render with the first parameter (so they wrap together) */
    separator?: ReactNode;
};

export const Parameters: FC<Props> = ({
    isEditMode,
    parameterValues,
    onParameterChange,
    parameters,
    isLoading,
    missingRequiredParameters = [],
    separator,
    parameterOrder = [],
    onParameterReorder,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [openPopoverId, setOpenPopoverId] = useState<string | undefined>();

    const handlePopoverOpen = useCallback((popoverId: string) => {
        setOpenPopoverId(popoverId);
    }, []);

    const handlePopoverClose = useCallback(() => {
        setOpenPopoverId(undefined);
    }, []);

    const mouseSensor = useSensor(MouseSensor, {
        activationConstraint: { distance: 10 },
    });
    const touchSensor = useSensor(TouchSensor, {
        activationConstraint: { delay: 250, tolerance: 5 },
    });
    const dragSensors = useSensors(mouseSensor, touchSensor);

    // Sort parameter entries by parameterOrder, with unordered params appended at the end
    const sortedParamEntries = useMemo(() => {
        if (!parameters) return [];
        const allKeys = Object.keys(parameters);
        if (parameterOrder.length === 0) {
            return allKeys.map((key) => [key, parameters[key]] as const);
        }
        const orderedKeys = parameterOrder.filter((key) =>
            allKeys.includes(key),
        );
        const unorderedKeys = allKeys.filter(
            (key) => !parameterOrder.includes(key),
        );
        return [...orderedKeys, ...unorderedKeys].map(
            (key) => [key, parameters[key]] as const,
        );
    }, [parameters, parameterOrder]);

    const orderedKeys = useMemo(
        () => sortedParamEntries.map(([key]) => key),
        [sortedParamEntries],
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!active || !over || active.id === over.id) return;
            const oldIndex = orderedKeys.indexOf(String(active.id));
            const newIndex = orderedKeys.indexOf(String(over.id));
            const newOrder = arrayMove(orderedKeys, oldIndex, newIndex);
            onParameterReorder?.(newOrder);
        },
        [orderedKeys, onParameterReorder],
    );

    const handleDragStart = useCallback(() => {
        handlePopoverClose();
    }, [handlePopoverClose]);

    if (!parameters || Object.keys(parameters).length === 0) {
        return null;
    }

    if (isLoading) {
        return (
            <Group gap="xs">
                {separator}
                <Skeleton h={30} w={120} radius={100} />
                <Skeleton h={30} w={120} radius={100} />
            </Group>
        );
    }

    return (
        <DndContext
            sensors={dragSensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            {sortedParamEntries.map(([paramKey, parameter], index) => {
                const paramComponent = (
                    <DroppableArea
                        key={paramKey}
                        id={paramKey}
                        orderedKeys={orderedKeys}
                    >
                        <DraggableItem
                            id={paramKey}
                            disabled={!isEditMode || !!openPopoverId}
                        >
                            <Parameter
                                paramKey={paramKey}
                                parameter={parameter}
                                value={parameterValues[paramKey] ?? null}
                                parameterValues={parameterValues}
                                openPopoverId={openPopoverId}
                                onPopoverOpen={handlePopoverOpen}
                                onPopoverClose={handlePopoverClose}
                                onParameterChange={onParameterChange}
                                projectUuid={projectUuid}
                                isRequired={missingRequiredParameters.includes(
                                    paramKey,
                                )}
                                isEditMode={isEditMode}
                                isDraggable={isEditMode}
                            />
                        </DraggableItem>
                    </DroppableArea>
                );

                // Group separator with first parameter so they wrap together
                if (index === 0 && separator) {
                    return (
                        <Group key={paramKey} gap="xs" wrap="nowrap">
                            {separator}
                            {paramComponent}
                        </Group>
                    );
                }

                return paramComponent;
            })}
            <DragOverlay />
        </DndContext>
    );
};
