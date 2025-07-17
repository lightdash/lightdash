import { Box, Button, Menu, Text, useMantineTheme } from '@mantine/core';
import {
    IconChevronDown,
    IconChevronUp,
    IconSettings,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { ParameterSelection, useParameters } from '../index';

type Props = {
    isEditMode: boolean;
    parameterValues: Record<string, string | string[] | null>;
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
        data: allParameters,
        isLoading,
        isError,
    } = useParameters(projectUuid);

    // Calculate selected parameters count
    const selectedParametersCount = Object.values(parameterValues).filter(
        (value) =>
            value !== null &&
            value !== '' &&
            (!Array.isArray(value) || value.length > 0),
    ).length;

    // Filter parameters to only show those referenced by dashboard charts
    const parameters = useMemo(() => {
        if (!allParameters) return {};

        // If no parameter references provided (standalone mode), show all parameters
        if (!parameterReferences) return allParameters;

        // If charts are still loading, show empty parameters for now
        if (!areAllChartsLoaded) return {};

        // If no parameters are referenced by charts, return empty
        if (parameterReferences.size === 0) return {};

        return Object.entries(allParameters).reduce(
            (filtered, [key, param]) => {
                if (parameterReferences.has(key)) {
                    filtered[key] = param;
                }
                return filtered;
            },
            {} as typeof allParameters,
        );
    }, [allParameters, parameterReferences, areAllChartsLoaded]);

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
                    onParameterChange(key, defaultValue || null);
                }
            });
        }
    }, [parameterValues, parameters, onParameterChange]);

    if (isEditMode) {
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
                    leftIcon={<MantineIcon icon={IconSettings} />}
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
                <Box p="sm">
                    <ParameterSelection
                        parameters={parameters}
                        isLoading={isLoading || !areAllChartsLoaded}
                        isError={isError}
                        parameterValues={parameterValues}
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
