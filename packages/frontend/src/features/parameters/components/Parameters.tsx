import { type ParametersValuesMap } from '@lightdash/common';
import { Box, Button, MantineProvider, Menu } from '@mantine-8/core';
import {
    IconChevronDown,
    IconChevronUp,
    IconVariable,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { getMantine8ThemeOverride } from '../../../mantine8Theme';
import { ParameterSelection, useParameters } from '../index';
import styles from './Parameters.module.css';

type Props = {
    isEditMode: boolean;
    parameterValues: ParametersValuesMap;
    onParameterChange: (key: string, value: string | string[] | null) => void;
    onClearAll: () => void;
    parameterReferences?: Set<string>;
    areAllChartsLoaded?: boolean;
    missingRequiredParameters?: string[];
    pinnedParameters?: string[];
    onParameterPin?: (paramKey: string) => void;
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
    missingRequiredParameters = [],
    pinnedParameters = [],
    onParameterPin,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [showOpenIcon, setShowOpenIcon] = useState(false);

    const {
        data: parameters,
        isLoading,
        isError,
    } = useParameters(projectUuid, Array.from(parameterReferences ?? []));

    // Calculate selected parameters count
    const selectedParametersCount = Object.values(parameters ?? {}).length;

    if (!parameters || selectedParametersCount === 0) {
        return null;
    }

    // Determine if we're in a loading state (either API loading or charts still loading)
    const isLoadingState = isLoading || !areAllChartsLoaded;

    // Determine button CSS classes based on state
    const buttonClasses = [
        selectedParametersCount > 0 && !isEditMode
            ? styles.parameterButtonActive
            : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <MantineProvider theme={getMantine8ThemeOverride()}>
            <Menu
                withinPortal
                withArrow
                arrowOffset={100}
                closeOnItemClick={false}
                closeOnClickOutside
                offset={-1}
                position="bottom-end"
                disabled={isLoadingState}
                onOpen={() => setShowOpenIcon(true)}
                onClose={() => setShowOpenIcon(false)}
            >
                <Menu.Target>
                    <Button
                        size="xs"
                        variant="default"
                        loading={isLoadingState}
                        disabled={isLoadingState}
                        className={buttonClasses}
                        leftSection={<MantineIcon icon={IconVariable} />}
                        rightSection={
                            <MantineIcon
                                icon={
                                    showOpenIcon
                                        ? IconChevronUp
                                        : IconChevronDown
                                }
                            />
                        }
                    >
                        Parameters
                        {selectedParametersCount > 0
                            ? ` (${selectedParametersCount})`
                            : ''}
                    </Button>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Label fz={10}>Parameters</Menu.Label>
                    <Box p="sm" miw={200}>
                        <ParameterSelection
                            parameters={parameters}
                            isLoading={isLoading || !areAllChartsLoaded}
                            isError={isError}
                            parameterValues={parameterValues}
                            onParameterChange={onParameterChange}
                            size="xs"
                            showClearAll={selectedParametersCount > 0}
                            onClearAll={onClearAll}
                            projectUuid={projectUuid}
                            missingRequiredParameters={
                                missingRequiredParameters
                            }
                            isEditMode={isEditMode}
                            pinnedParameters={pinnedParameters}
                            onParameterPin={onParameterPin}
                        />
                    </Box>
                </Menu.Dropdown>
            </Menu>
        </MantineProvider>
    );
};
