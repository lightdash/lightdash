import {
    type Dashboard,
    type LightdashProjectParameter,
    type ParametersValuesMap,
} from '@lightdash/common';
import {
    ActionIcon,
    Center,
    Group,
    Loader,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconPencil, IconRotate2 } from '@tabler/icons-react';
import { isEqual } from 'lodash';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { ParameterInput } from '../../../features/parameters/components/ParameterInput';
import { useParameters } from '../../../hooks/parameters/useParameters';

type SchedulerParameterItemProps = {
    paramKey: string;
    parameter: LightdashProjectParameter;
    dashboardValue: string | string[] | null;
    schedulerValue?: string | string[] | null;
    onChange: (paramKey: string, value: string | string[] | null) => void;
    onRevert: () => void;
    hasChanged: boolean;
    projectUuid: string;
    parameterValues?: ParametersValuesMap;
};

const ParameterItem: FC<SchedulerParameterItemProps> = ({
    paramKey,
    parameter,
    dashboardValue,
    schedulerValue,
    onChange,
    onRevert,
    hasChanged,
    projectUuid,
    parameterValues,
}) => {
    const [isEditing, setIsEditing] = useState(false);

    const currentValue = useMemo(
        () => schedulerValue ?? dashboardValue,
        [schedulerValue, dashboardValue],
    );

    const displayValue = useMemo(() => {
        if (!currentValue) return 'No value set';
        if (Array.isArray(currentValue)) {
            return currentValue.length > 0
                ? currentValue.join(', ')
                : 'No value set';
        }
        return currentValue;
    }, [currentValue]);

    return (
        <Group spacing="xs" align="flex-start" noWrap>
            <Tooltip
                label="Reset parameter back to dashboard default"
                fz="xs"
                disabled={!hasChanged}
            >
                <ActionIcon
                    size="xs"
                    disabled={!hasChanged}
                    onClick={() => {
                        if (isEditing) {
                            setIsEditing(false);
                        }
                        onRevert();
                    }}
                >
                    <MantineIcon icon={IconRotate2} />
                </ActionIcon>
            </Tooltip>

            <Stack key={paramKey} spacing="xs" w="100%">
                <Group spacing="xs">
                    <Text span fw={500}>
                        {parameter.label || paramKey}
                    </Text>

                    {parameter.description && (
                        <Text span size="xs" color="gray.6">
                            - {parameter.description}
                        </Text>
                    )}

                    {isEditing || hasChanged ? null : (
                        <Text fw={400} span color="gray.7">
                            = {displayValue}
                        </Text>
                    )}

                    <ActionIcon
                        size="xs"
                        disabled={isEditing || hasChanged}
                        onClick={() => {
                            setIsEditing(true);
                        }}
                    >
                        <MantineIcon icon={IconPencil} />
                    </ActionIcon>
                </Group>

                {(isEditing || hasChanged) && (
                    <ParameterInput
                        paramKey={paramKey}
                        parameter={parameter}
                        value={currentValue}
                        onParameterChange={(key, value) => {
                            onChange(key, value);
                            if (isEditing) {
                                setIsEditing(false);
                            }
                        }}
                        size="xs"
                        projectUuid={projectUuid}
                        parameterValues={parameterValues}
                    />
                )}
            </Stack>
        </Group>
    );
};

type SchedulerParametersProps = {
    dashboard?: Dashboard;
    parameterReferences?: Set<string> | string[];
    currentParameterValues?: ParametersValuesMap;
    onChange: (schedulerParameters: ParametersValuesMap) => void;
    schedulerParameters: ParametersValuesMap | undefined;
};

const SchedulerParameters: FC<SchedulerParametersProps> = ({
    dashboard,
    parameterReferences,
    currentParameterValues = {},
    schedulerParameters,
    onChange,
}) => {
    // Convert array to Set if needed
    const parameterReferencesSet = useMemo(() => {
        if (!parameterReferences) return new Set<string>();
        return Array.isArray(parameterReferences)
            ? new Set(parameterReferences)
            : parameterReferences;
    }, [parameterReferences]);

    // Use the explicitly passed parameter values
    const dashboardParameterValues = currentParameterValues;
    // Get parameters that are referenced in the dashboard
    const { data: availableParameters, isInitialLoading } = useParameters(
        dashboard?.projectUuid,
        parameterReferencesSet.size > 0
            ? Array.from(parameterReferencesSet)
            : undefined,
    );

    const handleParameterChange = useCallback(
        (paramKey: string, value: string | string[] | null) => {
            const updated = { ...schedulerParameters };

            if (
                value === null ||
                value === '' ||
                (Array.isArray(value) && value.length === 0)
            ) {
                // Remove parameter if set to empty/null
                delete updated[paramKey];
            } else {
                // Set parameter value
                updated[paramKey] = value;
            }

            onChange(updated);
        },
        [schedulerParameters, onChange],
    );

    const handleRevertParameter = useCallback(
        (paramKey: string) => {
            const updated = { ...schedulerParameters };
            delete updated[paramKey];
            onChange(updated);
        },
        [schedulerParameters, onChange],
    );

    const hasParameterChanged = useCallback(
        (paramKey: string) => {
            const schedulerValue = schedulerParameters?.[paramKey];
            if (!schedulerValue) return false;

            const dashboardValue = dashboardParameterValues?.[paramKey];
            return !isEqual(schedulerValue, dashboardValue);
        },
        [schedulerParameters, dashboardParameterValues],
    );

    if (isInitialLoading) {
        return (
            <Center component={Stack} h={100}>
                <Loader color="gray" />
                <Text color="dimmed">Loading parameters...</Text>
            </Center>
        );
    }

    if (!availableParameters || Object.keys(availableParameters).length === 0) {
        return (
            <Center component={Stack} h={100}>
                <Text color="dimmed">
                    No parameters defined for this project.
                </Text>
            </Center>
        );
    }

    return (
        <Stack>
            {Object.entries(availableParameters).map(
                ([paramKey, parameter]) => {
                    const schedulerValue = schedulerParameters?.[paramKey];
                    // Use actual dashboard parameter value, fallback to default if not set
                    const dashboardValue =
                        dashboardParameterValues?.[paramKey] ??
                        parameter.default ??
                        null;

                    return (
                        <ParameterItem
                            key={paramKey}
                            paramKey={paramKey}
                            parameter={parameter}
                            dashboardValue={dashboardValue}
                            schedulerValue={schedulerValue}
                            onChange={handleParameterChange}
                            onRevert={() => handleRevertParameter(paramKey)}
                            hasChanged={hasParameterChanged(paramKey)}
                            projectUuid={dashboard?.projectUuid || ''}
                            parameterValues={{
                                ...dashboardParameterValues,
                                ...schedulerParameters,
                            }}
                        />
                    );
                },
            )}
        </Stack>
    );
};

export default SchedulerParameters;
