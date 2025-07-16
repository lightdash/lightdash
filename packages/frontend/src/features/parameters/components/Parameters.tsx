import { Box, Button, Menu, Text, useMantineTheme } from '@mantine/core';
import {
    IconChevronDown,
    IconChevronUp,
    IconSettings,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { ParameterSelection, useParameters, useParameterState } from '../index';

type Props = {
    isEditMode: boolean;
};

export const Parameters: FC<Props> = ({ isEditMode }) => {
    const theme = useMantineTheme();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [showOpenIcon, setShowOpenIcon] = useState(false);

    const {
        parameterValues,
        handleParameterChange,
        clearAllParameters,
        selectedParametersCount,
    } = useParameterState();

    const dashboardParameterReferences = useDashboardContext(
        (c) => c.dashboardParameterReferences,
    );
    const areAllChartsLoaded = useDashboardContext((c) => c.areAllChartsLoaded);

    const {
        data: allParameters,
        isLoading,
        isError,
    } = useParameters(projectUuid);

    // Filter parameters to only show those referenced by dashboard charts
    const parameters = useMemo(() => {
        if (!allParameters) return {};

        // If charts are still loading, show empty parameters for now
        if (!areAllChartsLoaded) return {};

        // If no parameters are referenced by charts, return empty
        if (dashboardParameterReferences.size === 0) return {};

        return Object.entries(allParameters).reduce(
            (filtered, [key, param]) => {
                if (dashboardParameterReferences.has(key)) {
                    filtered[key] = param;
                }
                return filtered;
            },
            {} as typeof allParameters,
        );
    }, [allParameters, dashboardParameterReferences, areAllChartsLoaded]);

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
                    handleParameterChange(key, defaultValue || null);
                }
            });
        }
    }, [parameterValues, parameters, handleParameterChange]);

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
                        onParameterChange={handleParameterChange}
                        size="xs"
                        showClearAll={selectedParametersCount > 0}
                        onClearAll={clearAllParameters}
                    />
                </Box>
            </Menu.Dropdown>
        </Menu>
    );
};
