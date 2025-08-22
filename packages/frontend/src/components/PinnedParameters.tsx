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
} from '@mantine-8/core';
import { useCallback, useMemo, type FC } from 'react';
import { ParameterInput } from '../features/parameters/components/ParameterInput';
import useDashboardContext from '../providers/Dashboard/useDashboardContext';

interface PinnedParameterProps {
    parameterKey: string;
    parameter: LightdashProjectParameter;
    value: ParameterValue | null;
    onChange: (key: string, value: ParameterValue | null) => void;
    onUnpin: (key: string) => void;
    isEditMode: boolean;
    projectUuid?: string;
}

const PinnedParameter: FC<PinnedParameterProps> = ({
    parameterKey,
    parameter,
    value,
    onChange,
    onUnpin,
    isEditMode,
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
                    styles={{
                        inner: {
                            color: 'black',
                        },
                        label: {
                            maxWidth: '300px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        },
                    }}
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

    const pinnedParameterKeys = useDashboardContext((c) => c.pinnedParameters);

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
        <Group gap="xs">
            {pinnedParametersList.map(({ key, parameter }) => (
                <PinnedParameter
                    key={key}
                    parameterKey={key}
                    parameter={parameter}
                    value={parameterValues[key] ?? null}
                    onChange={handleParameterChange}
                    onUnpin={handleUnpin}
                    isEditMode={isEditMode}
                    projectUuid={dashboard?.projectUuid}
                />
            ))}
        </Group>
    );
};

export default PinnedParameters;
