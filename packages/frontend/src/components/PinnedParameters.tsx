import {
    DndContext,
    DragOverlay,
    MouseSensor,
    TouchSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
    type LightdashProjectParameter,
    type ParameterValue,
} from '@lightdash/common';
import {
    Box,
    Button,
    CloseButton,
    Group,
    Popover,
    Text,
    useMantineTheme,
} from '@mantine-8/core';
import { IconGripVertical } from '@tabler/icons-react';
import { useCallback, useMemo, type FC, type ReactNode } from 'react';
import { ParameterInput } from '../features/parameters/components/ParameterInput';
import useDashboardContext from '../providers/Dashboard/useDashboardContext';
import MantineIcon from './common/MantineIcon';

const DraggableItem: FC<{
    id: string;
    children: ReactNode;
    disabled?: boolean;
}> = ({ id, children, disabled }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id,
        disabled,
    });

    const style = transform
        ? ({
              position: 'relative',
              zIndex: 1,
              transform: `translate(${transform.x}px, ${transform.y}px)`,
              opacity: 0.8,
          } as const)
        : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
            {children}
        </div>
    );
};

const DroppableArea: FC<{
    id: string;
    children: ReactNode;
    pinnedKeys: string[];
}> = ({ id, children, pinnedKeys }) => {
    const { active, isOver, over, setNodeRef } = useDroppable({ id });
    const { colors } = useMantineTheme();

    const placeholderStyle = useMemo(() => {
        if (isOver && active && over && active.id !== over.id) {
            const oldIndex = pinnedKeys.indexOf(String(active.id));
            const newIndex = pinnedKeys.indexOf(String(over.id));
            if (newIndex < oldIndex) {
                return { boxShadow: `-8px 0px ${colors.blue[4]}` };
            } else if (newIndex > oldIndex) {
                return { boxShadow: `8px 0px ${colors.blue[4]}` };
            }
        }
    }, [isOver, active, over, pinnedKeys, colors]);

    return (
        <div ref={setNodeRef} style={placeholderStyle}>
            {children}
        </div>
    );
};

interface PinnedParameterProps {
    parameterKey: string;
    parameter: LightdashProjectParameter;
    value: ParameterValue | null;
    onChange: (key: string, value: ParameterValue | null) => void;
    onUnpin: (key: string) => void;
    isEditMode: boolean;
    isDraggable?: boolean;
    projectUuid?: string;
}

const PinnedParameter: FC<PinnedParameterProps> = ({
    parameterKey,
    parameter,
    value,
    onChange,
    onUnpin,
    isEditMode,
    isDraggable = false,
    projectUuid,
}) => {
    const parameterValues = useDashboardContext((c) => c.parameterValues);

    const displayValue = useMemo(() => {
        if (!value) return parameter.default || 'No value';
        if (Array.isArray(value)) {
            return value.length > 0 ? value.join(', ') : 'No value';
        }
        return value.toString();
    }, [value, parameter.default]);

    const handleChange = useCallback(
        (key: string, newValue: ParameterValue | null) => {
            onChange(key, newValue);
        },
        [onChange],
    );

    const handleUnpin = useCallback(() => {
        onUnpin(parameterKey);
    }, [onUnpin, parameterKey]);

    return (
        <Popover
            position="bottom-start"
            withArrow
            shadow="md"
            offset={1}
            arrowOffset={14}
            withinPortal
        >
            <Popover.Target>
                <Button
                    size="xs"
                    variant="default"
                    leftSection={
                        isDraggable && (
                            <MantineIcon
                                icon={IconGripVertical}
                                cursor="grab"
                                size="sm"
                            />
                        )
                    }
                    rightSection={
                        isEditMode ? (
                            <CloseButton
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleUnpin();
                                }}
                            />
                        ) : undefined
                    }
                >
                    <Text fz="inherit" truncate>
                        <Text fz="inherit" span>
                            {parameter.label || parameterKey}:
                        </Text>{' '}
                        <Text fz="inherit" fw={700} span>
                            {displayValue}
                        </Text>
                    </Text>
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <Box p={0} miw={280}>
                    <Text size="sm" fw={500} mb="xs">
                        {parameter.label || parameterKey}
                    </Text>
                    {parameter.description && (
                        <Text size="xs" c="dimmed" mb="sm">
                            {parameter.description}
                        </Text>
                    )}

                    <ParameterInput
                        paramKey={parameterKey}
                        parameter={parameter}
                        value={value}
                        onParameterChange={handleChange}
                        size="xs"
                        projectUuid={projectUuid || ''}
                        parameterValues={parameterValues}
                    />
                </Box>
            </Popover.Dropdown>
        </Popover>
    );
};

interface PinnedParametersProps {
    isEditMode: boolean;
}

const PinnedParameters: FC<PinnedParametersProps> = ({ isEditMode }) => {
    const dashboard = useDashboardContext((c) => c.dashboard);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const setParameter = useDashboardContext((c) => c.setParameter);
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const toggleParameterPin = useDashboardContext((c) => c.toggleParameterPin);
    const setPinnedParameters = useDashboardContext(
        (c) => c.setPinnedParameters,
    );

    const pinnedParameterKeys = useDashboardContext((c) => c.pinnedParameters);

    const mouseSensor = useSensor(MouseSensor, {
        activationConstraint: { distance: 10 },
    });
    const touchSensor = useSensor(TouchSensor, {
        activationConstraint: { delay: 250, tolerance: 5 },
    });
    const dragSensors = useSensors(mouseSensor, touchSensor);

    const handleParameterChange = useCallback(
        (key: string, value: ParameterValue | null) => {
            setParameter(key, value);
        },
        [setParameter],
    );

    const handleUnpin = useCallback(
        (key: string) => {
            toggleParameterPin(key);
        },
        [toggleParameterPin],
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!active || !over || active.id === over.id) return;
            const oldIndex = pinnedParameterKeys.indexOf(String(active.id));
            const newIndex = pinnedParameterKeys.indexOf(String(over.id));
            const newOrder = arrayMove(pinnedParameterKeys, oldIndex, newIndex);
            setPinnedParameters(newOrder);
        },
        [pinnedParameterKeys, setPinnedParameters],
    );

    if (!pinnedParameterKeys.length || !parameterDefinitions) {
        return null;
    }

    const pinnedParametersList = pinnedParameterKeys
        .map((paramKey) => ({
            key: paramKey,
            parameter: parameterDefinitions[paramKey],
        }))
        .filter(({ parameter }) => parameter !== undefined);

    if (pinnedParametersList.length === 0) {
        return null;
    }

    return (
        <DndContext sensors={dragSensors} onDragEnd={handleDragEnd}>
            <Group gap="xs">
                {pinnedParametersList.map(({ key, parameter }) => (
                    <DroppableArea
                        key={key}
                        id={key}
                        pinnedKeys={pinnedParameterKeys}
                    >
                        <DraggableItem id={key} disabled={!isEditMode}>
                            <PinnedParameter
                                parameterKey={key}
                                parameter={parameter}
                                value={parameterValues[key] ?? null}
                                onChange={handleParameterChange}
                                onUnpin={handleUnpin}
                                isEditMode={isEditMode}
                                isDraggable={isEditMode}
                                projectUuid={dashboard?.projectUuid}
                            />
                        </DraggableItem>
                    </DroppableArea>
                ))}
            </Group>
            <DragOverlay />
        </DndContext>
    );
};

export default PinnedParameters;
