import {
    type LightdashProjectParameter,
    type ParametersValuesMap,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    SimpleGrid,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { ParameterInput } from './ParameterInput';

type ParameterSelectionProps = {
    parameters?: Record<string, LightdashProjectParameter>;
    isLoading?: boolean;
    isError?: boolean;
    parameterValues: ParametersValuesMap;
    onParameterChange: (
        paramKey: string,
        value: string | string[] | null,
    ) => void;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    showClearAll?: boolean;
    onClearAll?: () => void;
    cols?: number;
    projectUuid?: string;
    loadingMessage?: string;
    disabled?: boolean;
};

export const ParameterSelection: FC<ParameterSelectionProps> = ({
    parameters,
    isLoading,
    isError,
    parameterValues,
    onParameterChange,
    size = 'xs',
    showClearAll = false,
    onClearAll,
    cols = 1,
    projectUuid,
    disabled = false,
}) => {
    const parameterKeys = parameters ? Object.keys(parameters) : [];
    const selectedParametersCount = Object.values(parameterValues).filter(
        (value) => value !== null && value !== '',
    ).length;

    if (isLoading) {
        return (
            <Text size={size} c="dimmed">
                Loading parameters...
            </Text>
        );
    }

    if (isError) {
        return (
            <Text size={size} c="dimmed">
                Failed to load parameters
            </Text>
        );
    }

    if (parameterKeys.length === 0) {
        return (
            <Text size={size} c="dimmed">
                No parameters available
            </Text>
        );
    }

    return (
        <Stack>
            <SimpleGrid
                cols={cols}
                spacing="sm"
                breakpoints={[{ maxWidth: 'sm', cols: 1 }]}
            >
                {parameterKeys.map((paramKey) => {
                    const parameter = parameters?.[paramKey];
                    if (!parameter) {
                        return (
                            <Text key={paramKey}>Error loading parameter</Text>
                        );
                    }
                    return (
                        <Box key={paramKey}>
                            <Group
                                align="center"
                                position="left"
                                spacing="xs"
                                mb="xxs"
                            >
                                <Text size={size} fw={500}>
                                    {parameters?.[paramKey]?.label || paramKey}
                                </Text>
                                {parameters?.[paramKey]?.description && (
                                    <Tooltip
                                        withinPortal
                                        position="top"
                                        maw={350}
                                        label={
                                            parameters?.[paramKey]?.description
                                        }
                                    >
                                        <MantineIcon
                                            icon={IconInfoCircle}
                                            color="gray.6"
                                            size={size}
                                        />
                                    </Tooltip>
                                )}
                            </Group>
                            <ParameterInput
                                paramKey={paramKey}
                                parameter={parameter}
                                onParameterChange={onParameterChange}
                                value={parameterValues[paramKey]}
                                size={size}
                                projectUuid={projectUuid}
                                parameterValues={parameterValues}
                                disabled={disabled}
                            />
                        </Box>
                    );
                })}
            </SimpleGrid>

            {showClearAll && selectedParametersCount > 0 && onClearAll && (
                <Tooltip label="Clear all parameter values" position="bottom">
                    <Button
                        selfAlign="flex-end"
                        variant="subtle"
                        compact
                        size="xs"
                        color="gray"
                        onClick={onClearAll}
                        style={{ alignSelf: 'flex-end' }}
                        disabled={disabled}
                    >
                        Clear all
                    </Button>
                </Tooltip>
            )}
        </Stack>
    );
};
