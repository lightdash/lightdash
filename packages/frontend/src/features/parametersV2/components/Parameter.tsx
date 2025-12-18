import {
    formatDate,
    parseDate,
    TimeFrames,
    type LightdashProjectParameter,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Popover,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useId } from '@mantine-8/hooks';
import { IconX } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import styles from './Parameter.module.css';
import { ParameterInput } from './ParameterInput';

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
}) => {
    const popoverId = useId();
    const isPopoverOpen = openPopoverId === popoverId;

    const displayLabel = parameter.label || paramKey;

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
            shadow="md"
            offset={1}
            arrowOffset={14}
            withinPortal
        >
            <Popover.Target>
                <Tooltip
                    label={parameter.description}
                    disabled={!parameter.description || isPopoverOpen}
                    position="top"
                    withinPortal
                    maw={350}
                    multiline
                >
                    <Button
                        pos="relative"
                        size="xs"
                        variant={
                            hasUnsetRequiredParameter ? 'outline' : 'default'
                        }
                        classNames={{
                            label: styles.label,
                        }}
                        className={`${styles.button} ${
                            hasUnsetRequiredParameter
                                ? styles.unsetRequired
                                : ''
                        }`}
                        rightSection={
                            hasValue && (
                                <ActionIcon
                                    onClick={handleClear}
                                    size="xs"
                                    color="dark"
                                    radius="xl"
                                    variant="subtle"
                                >
                                    <MantineIcon size="sm" icon={IconX} />
                                </ActionIcon>
                            )
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
                                <Text span fw={600} fz="inherit">
                                    {displayLabel}
                                </Text>
                                <Text span c="gray.6" fz="inherit">
                                    {' '}
                                    is{' '}
                                </Text>
                                <Text span fz="inherit">
                                    {displayValue}
                                </Text>
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
