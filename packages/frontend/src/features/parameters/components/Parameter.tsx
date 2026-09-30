import {
    DEFAULT_UI_STRINGS,
    interpolateUiString,
    formatDate,
    parseDate,
    resolveParameterDefault,
    TimeFrames,
    type LightdashProjectParameter,
    type ParametersValuesMap,
    type ParameterValue,
    type UiStringResolver,
    type UiStringKey,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Popover,
    Text,
    Tooltip,
} from '@mantine/core';
import { useId } from '@mantine/hooks';
import { IconGripVertical, IconX } from '@tabler/icons-react';
import { useCallback, useMemo, useRef, type FC } from 'react';
import { type DragHandle } from '../../../components/common/DndHelpers';
import MantineIcon from '../../../components/common/MantineIcon';
import styles from './Parameter.module.css';
import { ParameterInput } from './ParameterInput';
import { ShadowedReservedNameWarning } from './ShadowedReservedNameWarning';

type Props = {
    paramKey: string;
    parameter: LightdashProjectParameter;
    value: ParameterValue | null;
    parameterValues: ParametersValuesMap;
    openPopoverId: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
    onParameterChange: (paramKey: string, value: ParameterValue | null) => void;
    projectUuid?: string;
    isRequired?: boolean;
    isEditMode?: boolean;
    isDashboard?: boolean;
    isDraggable?: boolean;
    dragHandle?: DragHandle;
    triggerClassName?: string;
    dropdownClassName?: string;
    shadowedReservedNames?: string[];
    getUiString?: UiStringResolver;
};

const Parameter: FC<Props> = ({
    paramKey,
    parameter,
    value,
    parameterValues,
    openPopoverId,
    onPopoverOpen,
    onPopoverClose,
    onParameterChange,
    projectUuid,
    isRequired = false,
    isEditMode = false,
    isDashboard = false,
    isDraggable = false,
    dragHandle,
    triggerClassName,
    dropdownClassName,
    shadowedReservedNames = [],
    getUiString,
}) => {
    const popoverId = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const isPopoverOpen = openPopoverId === popoverId;

    const displayLabel = parameter.label || paramKey;
    const uiString = (key: UiStringKey) =>
        getUiString ? getUiString(key) : DEFAULT_UI_STRINGS[key];
    const clearLabel = interpolateUiString(uiString('parameters.clearNamed'), {
        name: displayLabel,
    });
    const reorderLabel = interpolateUiString(
        uiString('parameters.reorderNamed'),
        { name: displayLabel },
    );
    const isLabel = getUiString
        ? getUiString('parameters.is')
        : DEFAULT_UI_STRINGS['parameters.is'];

    const displayValue = useMemo(() => {
        if (value === null || value === undefined || value === '') {
            const defaultVal = resolveParameterDefault(parameter);
            if (defaultVal !== undefined) {
                if (
                    parameter.type === 'date' &&
                    typeof defaultVal === 'string'
                ) {
                    const date = parseDate(defaultVal, TimeFrames.DAY);
                    return date
                        ? formatDate(date, TimeFrames.DAY, false)
                        : defaultVal;
                }
                if (Array.isArray(defaultVal)) {
                    return defaultVal.join(', ');
                }
                return String(defaultVal);
            }
            return '';
        }

        if (parameter.type === 'date' && typeof value === 'string') {
            const date = parseDate(value, TimeFrames.DAY);
            return date ? formatDate(date, TimeFrames.DAY, false) : value;
        }

        if (Array.isArray(value)) {
            return value.join(', ');
        }

        return String(value);
    }, [value, parameter]);

    const hasValue =
        value !== null &&
        value !== undefined &&
        value !== '' &&
        (!Array.isArray(value) || value.length > 0);
    const hasDefault = resolveParameterDefault(parameter) !== undefined;
    const hasUnsetRequiredParameter = isRequired && !hasValue && !hasDefault;
    const valueLabel = hasValue
        ? `${isLabel} ${displayValue}`
        : hasDefault
          ? interpolateUiString(uiString('parameters.defaultValue'), {
                value: displayValue,
            })
          : uiString(
                hasUnsetRequiredParameter || !isDashboard
                    ? 'parameters.selectValue'
                    : 'parameters.chartValues',
            );
    const hasShadowedReservedName = shadowedReservedNames.includes(paramKey);

    const handleClose = useCallback(() => {
        if (isPopoverOpen) onPopoverClose();
    }, [isPopoverOpen, onPopoverClose]);

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onParameterChange(paramKey, null);
        triggerRef.current?.focus();
    };

    const handleToggle = useCallback(() => {
        if (isPopoverOpen) {
            handleClose();
        } else {
            onPopoverOpen(popoverId);
        }
    }, [isPopoverOpen, handleClose, onPopoverOpen, popoverId]);

    return (
        <Group gap="xxs" wrap="nowrap">
            {isDraggable && dragHandle && (
                <Tooltip label={reorderLabel}>
                    <ActionIcon
                        ref={dragHandle.setActivatorNodeRef}
                        {...dragHandle.attributes}
                        {...dragHandle.listeners}
                        aria-label={reorderLabel}
                        size="sm"
                    >
                        <MantineIcon icon={IconGripVertical} size="sm" />
                    </ActionIcon>
                </Tooltip>
            )}
            <Popover
                position="bottom-start"
                width={400}
                opened={isPopoverOpen}
                onClose={handleClose}
                onDismiss={handleClose}
                transitionProps={{ transition: 'pop-top-left' }}
                withArrow
                offset={1}
                arrowOffset={14}
                classNames={{ dropdown: dropdownClassName }}
            >
                <Popover.Target>
                    <Tooltip
                        label={parameter.description}
                        disabled={!parameter.description || isPopoverOpen}
                        position="top"
                        maw={350}
                    >
                        <Button
                            ref={triggerRef}
                            pos="relative"
                            size="xs"
                            variant={
                                hasUnsetRequiredParameter
                                    ? 'outline'
                                    : 'default'
                            }
                            classNames={{
                                label: styles.label,
                                root: triggerClassName,
                            }}
                            className={
                                hasUnsetRequiredParameter
                                    ? styles.unsetRequired
                                    : ''
                            }
                            onClick={handleToggle}
                        >
                            <Box className={styles.value}>
                                <Text fz="xs" truncate>
                                    <Text span fw={600}>
                                        {displayLabel}
                                    </Text>
                                    <Text
                                        span
                                        c={hasValue ? undefined : 'dimmed'}
                                    >
                                        {` ${valueLabel}`}
                                    </Text>
                                </Text>
                            </Box>
                        </Button>
                    </Tooltip>
                </Popover.Target>
                <Popover.Dropdown p="sm" maw="calc(100vw - 32px)">
                    <ParameterInput
                        getUiString={getUiString}
                        paramKey={paramKey}
                        parameter={parameter}
                        value={value}
                        onParameterChange={onParameterChange}
                        size="sm"
                        projectUuid={projectUuid}
                        parameterValues={parameterValues}
                        isError={hasUnsetRequiredParameter}
                        clearLabel={clearLabel}
                    />
                    {!hasValue && isDashboard && (
                        <Text fz="xs" c="dimmed" mt="xs">
                            {uiString(
                                hasUnsetRequiredParameter
                                    ? 'parameters.requiredHint'
                                    : hasDefault
                                      ? 'parameters.defaultHint'
                                      : 'parameters.chartHint',
                            )}
                        </Text>
                    )}
                    {isDashboard && (
                        <Text fz="xs" c="dimmed" mt="xs">
                            {uiString(
                                isEditMode
                                    ? 'parameters.editHint'
                                    : 'parameters.viewHint',
                            )}
                        </Text>
                    )}
                </Popover.Dropdown>
            </Popover>
            {hasShadowedReservedName && (
                <ShadowedReservedNameWarning paramKey={paramKey} />
            )}
            {hasValue && (
                <Tooltip label={clearLabel}>
                    <ActionIcon
                        aria-label={clearLabel}
                        onClick={handleClear}
                        size="sm"
                    >
                        <MantineIcon size="sm" icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

export default Parameter;
