import { DndContext, DragOverlay, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
    formatDate,
    interpolateUiString,
    parseDate,
    resolveParameterDefault,
    TimeFrames,
    type LightdashProjectParameter,
    type ParameterValue,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    CloseButton,
    Group,
    Popover,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useUiStrings } from '../ee/providers/Embed/useUiStrings';
import { ParameterInput } from '../features/parameters/components/ParameterInput';
import { useDndSensors } from '../hooks/useDndSensors';
import useDashboardContext from '../providers/Dashboard/useDashboardContext';
import {
    DraggableItem,
    DroppableArea,
    type DragHandle,
} from './common/DndHelpers';
import MantineIcon from './common/MantineIcon';
import styles from './PinnedParameters.module.css';

interface PinnedParameterProps {
    parameterKey: string;
    parameter: LightdashProjectParameter;
    value: ParameterValue | null;
    onChange: (key: string, value: ParameterValue | null) => void;
    onUnpin: (key: string) => void;
    isEditMode: boolean;
    isDraggable?: boolean;
    projectUuid?: string;
    dragHandle?: DragHandle;
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
    dragHandle,
}) => {
    const parameterValues = useDashboardContext((c) => c.parameterValues);

    const getUiString = useUiStrings();
    const displayLabel = parameter.label || parameterKey;
    const hasValue =
        value !== null &&
        value !== undefined &&
        value !== '' &&
        (!Array.isArray(value) || value.length > 0);

    const displayValue = useMemo(() => {
        const resolvedDefault = resolveParameterDefault(parameter);
        const display = hasValue ? value : resolvedDefault;
        if (display === undefined || display === null) {
            return getUiString('parameters.chartValues');
        }
        let formatted = Array.isArray(display)
            ? display.join(', ')
            : String(display);
        if (parameter.type === 'date' && typeof display === 'string') {
            const date = parseDate(display, TimeFrames.DAY);
            if (date) formatted = formatDate(date, TimeFrames.DAY, false);
        }
        return hasValue
            ? formatted
            : interpolateUiString(getUiString('parameters.defaultValue'), {
                  value: formatted,
              });
    }, [value, parameter, hasValue, getUiString]);

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
        <Popover position="bottom-start" withArrow offset={1} arrowOffset={14}>
            <Group gap={4} wrap="nowrap">
                {isDraggable && dragHandle && (
                    <Tooltip
                        label={interpolateUiString(
                            getUiString('parameters.reorderNamed'),
                            { name: displayLabel },
                        )}
                    >
                        <ActionIcon
                            ref={dragHandle.setActivatorNodeRef}
                            {...dragHandle.attributes}
                            {...dragHandle.listeners}
                            aria-label={interpolateUiString(
                                getUiString('parameters.reorderNamed'),
                                { name: displayLabel },
                            )}
                            variant="subtle"
                            size="sm"
                        >
                            <MantineIcon icon={IconGripVertical} size="sm" />
                        </ActionIcon>
                    </Tooltip>
                )}
                <Popover.Target>
                    <Button
                        size="xs"
                        variant="default"
                        classNames={{ label: styles.label }}
                    >
                        <Text truncate>
                            <Text span>{parameter.label || parameterKey}:</Text>{' '}
                            <Text
                                fw={hasValue ? 600 : 400}
                                c={hasValue ? undefined : 'dimmed'}
                                span
                            >
                                {displayValue}
                            </Text>
                        </Text>
                    </Button>
                </Popover.Target>
                {isEditMode && (
                    <Tooltip
                        label={interpolateUiString(
                            getUiString('parameters.unpinNamed'),
                            { name: displayLabel },
                        )}
                    >
                        <CloseButton
                            size="sm"
                            aria-label={interpolateUiString(
                                getUiString('parameters.unpinNamed'),
                                { name: displayLabel },
                            )}
                            onClick={handleUnpin}
                        />
                    </Tooltip>
                )}
            </Group>

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
                        getUiString={getUiString}
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

    const dragSensors = useDndSensors();

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
                        orderedKeys={pinnedParameterKeys}
                    >
                        <DraggableItem id={key} disabled={!isEditMode}>
                            {(dragHandle) => (
                                <PinnedParameter
                                    parameterKey={key}
                                    parameter={parameter}
                                    value={parameterValues[key] ?? null}
                                    onChange={handleParameterChange}
                                    onUnpin={handleUnpin}
                                    isEditMode={isEditMode}
                                    isDraggable={isEditMode}
                                    projectUuid={dashboard?.projectUuid}
                                    dragHandle={dragHandle}
                                />
                            )}
                        </DraggableItem>
                    </DroppableArea>
                ))}
            </Group>
            <DragOverlay />
        </DndContext>
    );
};

export default PinnedParameters;
