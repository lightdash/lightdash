import {
    DEFAULT_UI_STRINGS,
    formatDate,
    parseDate,
    TimeFrames,
    type LightdashProjectParameter,
    type ParametersValuesMap,
    type ParameterValue,
    type UiStringResolver,
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
import { useCallback, useMemo, type FC } from 'react';
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
    isDraggable?: boolean;
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
    isDraggable = false,
    triggerClassName,
    dropdownClassName,
    shadowedReservedNames = [],
    getUiString,
}) => {
    const popoverId = useId();
    const isPopoverOpen = openPopoverId === popoverId;

    const displayLabel = parameter.label || paramKey;
    const isLabel = getUiString
        ? getUiString('parameters.is')
        : DEFAULT_UI_STRINGS['parameters.is'];

    const displayValue = useMemo(() => {
        if (value === null || value === undefined || value === '') {
            if (parameter.default !== undefined) {
                const defaultVal = parameter.default;
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
            return 'any value';
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

    const hasValue = value !== null && value !== undefined && value !== '';
    const hasUnsetRequiredParameter = isRequired && !hasValue;
    const hasShadowedReservedName = shadowedReservedNames.includes(paramKey);

    const handleClose = useCallback(() => {
        if (isPopoverOpen) onPopoverClose();
    }, [isPopoverOpen, onPopoverClose]);

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onParameterChange(paramKey, null);
    };

    const handleToggle = useCallback(() => {
        if (isPopoverOpen) {
            handleClose();
        } else {
            onPopoverOpen(popoverId);
        }
    }, [isPopoverOpen, handleClose, onPopoverOpen, popoverId]);

    return (
        <Popover
            position="bottom-start"
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
                        pos="relative"
                        size="xs"
                        variant={
                            hasUnsetRequiredParameter ? 'outline' : 'default'
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
                            <Group gap={4} wrap="nowrap">
                                {hasShadowedReservedName && (
                                    <ShadowedReservedNameWarning
                                        paramKey={paramKey}
                                    />
                                )}
                                {hasValue && (
                                    <ActionIcon
                                        onClick={handleClear}
                                        size="xs"
                                        radius="xl"
                                    >
                                        <MantineIcon size="sm" icon={IconX} />
                                    </ActionIcon>
                                )}
                            </Group>
                        }
                        onClick={handleToggle}
                    >
                        <Box
                            style={{
                                maxWidth: '100%',
                                overflow: 'hidden',
                            }}
                        >
                            <Text fz="xs" truncate>
                                <Text span fw={600}>
                                    {displayLabel}
                                </Text>
                                <Text span c="gray.6">
                                    {` ${isLabel} `}
                                </Text>
                                <Text span>{displayValue}</Text>
                            </Text>
                        </Box>
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm" miw={200}>
                <ParameterInput
                    paramKey={paramKey}
                    parameter={parameter}
                    value={value}
                    onParameterChange={onParameterChange}
                    size="sm"
                    projectUuid={projectUuid}
                    parameterValues={parameterValues}
                />
            </Popover.Dropdown>
        </Popover>
    );
};

export default Parameter;
