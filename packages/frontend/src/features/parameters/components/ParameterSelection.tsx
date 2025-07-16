import { type LightdashProjectParameter } from '@lightdash/common';
import { Box, Select, SimpleGrid, Text } from '@mantine/core';
import { type FC } from 'react';

type ParameterSelectionProps = {
    parameters?: Record<string, LightdashProjectParameter>;
    isLoading?: boolean;
    isError?: boolean;
    parameterValues: Record<string, string | null>;
    onParameterChange: (paramKey: string, value: string | null) => void;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    showClearAll?: boolean;
    onClearAll?: () => void;
    cols?: number;
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
        <>
            <SimpleGrid
                cols={cols}
                spacing="sm"
                breakpoints={[{ maxWidth: 'sm', cols: 1 }]}
            >
                {parameterKeys.map((paramKey) => {
                    const options = parameters?.[paramKey]?.options || [];
                    return (
                        <Box key={paramKey}>
                            <Text size={size} fw={500} mb="xxs">
                                {parameters?.[paramKey]?.label || paramKey}
                            </Text>
                            <Select
                                placeholder="Choose value..."
                                value={parameterValues[paramKey] || null}
                                onChange={(value) =>
                                    onParameterChange(paramKey, value)
                                }
                                data={options}
                                size={size}
                                searchable
                                clearable
                            />
                        </Box>
                    );
                })}
            </SimpleGrid>

            {showClearAll && selectedParametersCount > 0 && onClearAll && (
                <Box mt="md">
                    <Text
                        size={size}
                        c="blue"
                        style={{ cursor: 'pointer' }}
                        onClick={onClearAll}
                    >
                        Clear All
                    </Text>
                </Box>
            )}
        </>
    );
};
