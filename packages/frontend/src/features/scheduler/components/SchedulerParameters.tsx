import {
    type Dashboard,
    type LightdashProjectParameter,
    type ParameterDefinitions,
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
import isEqual from 'lodash/isEqual';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { ParameterInput } from '../../parameters/components/ParameterInput';

type SchedulerParameterItemProps = {
    paramKey: string;
    parameter: LightdashProjectParameter;
    dashboardValue: string | number | string[] | number[] | null;
    schedulerValue?: string | number | string[] | number[] | null;
    onChange: (
        paramKey: string,
        value: string | number | string[] | number[] | null,
    ) => void;
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
                        <Text span size="xs" color="ldGray.6">
                            - {parameter.description}
                        </Text>
                    )}

                    {isEditing || hasChanged ? null : (
                        <Text fw={400} span color="ldGray.7">
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
    currentParameterValues?: ParametersValuesMap;
    onChange: (schedulerParameters: ParametersValuesMap) => void;
    schedulerParameterValues: ParametersValuesMap | undefined;
    availableParameters: ParameterDefinitions | undefined;
    isLoading: boolean;
};

const SchedulerParameters: FC<SchedulerParametersProps> = ({
    dashboard,
    currentParameterValues = {},
    schedulerParameterValues,
    availableParameters,
    onChange,
    isLoading,
}) => {
    const handleParameterChange = useCallback(
        (
            paramKey: string,
            value: string | number | string[] | number[] | null,
        ) => {
            const updated = { ...schedulerParameterValues };

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
        [schedulerParameterValues, onChange],
    );

    const handleRevertParameter = useCallback(
        (paramKey: string) => {
            const updated = { ...schedulerParameterValues };
            delete updated[paramKey];
            onChange(updated);
        },
        [schedulerParameterValues, onChange],
    );

    const hasParameterChanged = useCallback(
        (paramKey: string) => {
            const schedulerValue = schedulerParameterValues?.[paramKey];
            if (!schedulerValue) return false;

            const parameterValue = currentParameterValues?.[paramKey];
            return !isEqual(schedulerValue, parameterValue);
        },
        [schedulerParameterValues, currentParameterValues],
    );

    if (isLoading) {
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
                    const schedulerValue = schedulerParameterValues?.[paramKey];
                    // Use actual dashboard parameter value, fallback to default if not set
                    const dashboardValue =
                        currentParameterValues?.[paramKey] ??
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
                                ...currentParameterValues,
                                ...schedulerParameterValues,
                            }}
                        />
                    );
                },
            )}
        </Stack>
    );
};

export default SchedulerParameters;
