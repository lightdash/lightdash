import { type ParametersValuesMap } from '@lightdash/common';
import { Box, Button, Menu, Text, useMantineTheme } from '@mantine/core';
import {
    IconChevronDown,
    IconChevronUp,
    IconVariable,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { ParameterSelection, useParameters } from '../index';

type Props = {
    isEditMode: boolean;
    parameterValues: ParametersValuesMap;
    onParameterChange: (key: string, value: string | string[] | null) => void;
    onClearAll: () => void;
    parameterReferences?: Set<string>;
    areAllChartsLoaded?: boolean;
};

/**
 * @example
 * // Dashboard usage (with filtering)
 * <Parameters
 *   isEditMode={false}
 *   parameterValues={parameterValues}
 *   onParameterChange={handleParameterChange}
 *   onClearAll={clearAllParameters}
 *   parameterReferences={dashboardParameterReferences}
 *   areAllChartsLoaded={areAllChartsLoaded}
 * />
 *
 * @example
 * // Standalone usage (shows all parameters)
 * <Parameters
 *   isEditMode={false}
 *   parameterValues={parameterValues}
 *   onParameterChange={handleParameterChange}
 *   onClearAll={clearAllParameters}
 * />
 */
export const Parameters: FC<Props> = ({
    isEditMode,
    parameterValues,
    onParameterChange,
    onClearAll,
    parameterReferences,
    areAllChartsLoaded = true,
}) => {
    const theme = useMantineTheme();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [showOpenIcon, setShowOpenIcon] = useState(false);

    const {
        data: parameters,
        isLoading,
        isError,
    } = useParameters(projectUuid, Array.from(parameterReferences ?? []));

    // Calculate selected parameters count
    const selectedParametersCount = Object.values(parameters ?? {}).length;

    // Filter out null values to match ParametersValuesMap type
    const filteredParameterValues = Object.entries(parameterValues).reduce(
        (acc, [key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                acc[key] = value;
            }
            return acc;
        },
        {} as Record<string, string | string[]>,
    );

    // Apply defaults
    useEffect(() => {
        if (parameters) {
            Object.entries(parameters).forEach(([key, param]) => {
                if (
                    param.default &&
                    (!parameterValues || !parameterValues[key])
                ) {
                    const defaultValue = Array.isArray(param.default)
                        ? param.default[0]
                        : param.default;
                    onParameterChange(key, defaultValue);
                }
            });
        }
    }, [parameterValues, parameters, onParameterChange]);

    if (isEditMode || !parameters || Object.keys(parameters).length === 0) {
        return null;
    }

    // Determine if we're in a loading state (either API loading or charts still loading)
    const isLoadingState = isLoading || !areAllChartsLoaded;

    return (
        <Menu
            withinPortal
            withArrow
            closeOnItemClick={false}
            closeOnClickOutside
            offset={-1}
            position="bottom-end"
            disabled={isEditMode || isLoadingState}
            onOpen={() => setShowOpenIcon(true)}
            onClose={() => setShowOpenIcon(false)}
        >
            <Menu.Target>
                <Button
                    size="xs"
                    variant="default"
                    loaderPosition="center"
                    loading={isLoadingState}
                    disabled={isEditMode || isLoadingState}
                    sx={{
                        borderColor:
                            selectedParametersCount > 0
                                ? theme.colors.blue['6']
                                : 'default',
                    }}
                    leftIcon={<MantineIcon icon={IconVariable} />}
                    rightIcon={
                        <MantineIcon
                            icon={
                                showOpenIcon ? IconChevronUp : IconChevronDown
                            }
                        />
                    }
                >
                    <Text>
                        Parameters
                        {selectedParametersCount > 0
                            ? ` (${selectedParametersCount})`
                            : ''}
                    </Text>
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label fz={10}>Parameters</Menu.Label>
                <Box p="sm" miw={200}>
                    <ParameterSelection
                        parameters={parameters}
                        isLoading={isLoading || !areAllChartsLoaded}
                        isError={isError}
                        parameterValues={filteredParameterValues}
                        onParameterChange={onParameterChange}
                        size="xs"
                        showClearAll={selectedParametersCount > 0}
                        onClearAll={onClearAll}
                    />
                </Box>
            </Menu.Dropdown>
        </Menu>
    );
};
