import { type LightdashProjectParameter } from '@lightdash/common';
import { Box, Button, CloseButton, Group, Popover, Text } from '@mantine/core';
import { useCallback, useMemo, type FC } from 'react';
import { ParameterInput } from '../features/parameters/components/ParameterInput';
import useDashboardContext from '../providers/Dashboard/useDashboardContext';

interface PinnedParameterProps {
    parameterKey: string;
    parameter: LightdashProjectParameter;
    value: string | string[] | null;
    onChange: (key: string, value: string | string[] | null) => void;
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
        (key: string, newValue: string | string[] | null) => {
            onChange(key, newValue);
        },
        [onChange],
    );

    const handleUnpin = useCallback(() => {
        onUnpin(parameterKey);
    }, [onUnpin, parameterKey]);

    const hasValue = Boolean(
        value && (Array.isArray(value) ? value.length > 0 : true),
    );

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
                    rightIcon={
                        isEditMode ? (
                            <CloseButton
                                size="xs"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleUnpin();
                                }}
                            />
                        ) : undefined
                    }
                >
                    <Box
                        sx={{
                            maxWidth: '100%',
                            overflow: 'hidden',
                        }}
                    >
                        <Text fz="xs" truncate>
                            <Text fw={600} span truncate>
                                {parameter.label || parameterKey}:{' '}
                            </Text>
                            <Text fw={hasValue ? 700 : 400} span truncate>
                                {displayValue}
                            </Text>
                        </Text>
                    </Box>
                </Button>
            </Popover.Target>

            <Popover.Dropdown>
                <Box p="sm" miw={280}>
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
                        size="sm"
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
        (key: string, value: string | string[] | null) => {
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
        <Group spacing="xs">
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
