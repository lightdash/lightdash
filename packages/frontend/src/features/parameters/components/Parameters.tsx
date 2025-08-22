import {
    type ParameterDefinitions,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import { Box, Button, Menu } from '@mantine-8/core';
import {
    IconChevronDown,
    IconChevronUp,
    IconVariable,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { ParameterSelection } from '../index';
import styles from './Parameters.module.css';

type Props = {
    isEditMode: boolean;
    parameterValues: ParametersValuesMap;
    onParameterChange: (key: string, value: ParameterValue | null) => void;
    onClearAll: () => void;
    parameters?: ParameterDefinitions;
    missingRequiredParameters?: string[];
    pinnedParameters?: string[];
    onParameterPin?: (paramKey: string) => void;
    isLoading?: boolean;
    isError?: boolean;
};

export const Parameters: FC<Props> = ({
    isEditMode,
    parameterValues,
    onParameterChange,
    onClearAll,
    parameters,
    isLoading,
    isError,
    missingRequiredParameters = [],
    pinnedParameters = [],
    onParameterPin,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [showOpenIcon, setShowOpenIcon] = useState(false);

    // Calculate selected parameters count
    const selectedParametersCount = Object.values(parameters ?? {}).length;

    if (!parameters || selectedParametersCount === 0) {
        return null;
    }

    // Determine button CSS classes based on state
    const buttonClasses = [
        selectedParametersCount > 0 && !isEditMode
            ? styles.parameterButtonActive
            : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <Menu
            withinPortal
            withArrow
            arrowOffset={100}
            closeOnItemClick={false}
            closeOnClickOutside
            offset={-1}
            position="bottom-end"
            disabled={isLoading}
            onOpen={() => setShowOpenIcon(true)}
            onClose={() => setShowOpenIcon(false)}
        >
            <Menu.Target>
                <Button
                    size="xs"
                    variant="default"
                    loading={isLoading}
                    disabled={isLoading}
                    className={buttonClasses}
                    leftSection={<MantineIcon icon={IconVariable} />}
                    rightSection={
                        <MantineIcon
                            icon={
                                showOpenIcon ? IconChevronUp : IconChevronDown
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
                        isLoading={isLoading}
                        isError={isError}
                        parameterValues={parameterValues}
                        onParameterChange={onParameterChange}
                        size="xs"
                        showClearAll={selectedParametersCount > 0}
                        onClearAll={onClearAll}
                        projectUuid={projectUuid}
                        missingRequiredParameters={missingRequiredParameters}
                        isEditMode={isEditMode}
                        pinnedParameters={pinnedParameters}
                        onParameterPin={onParameterPin}
                    />
                </Box>
            </Menu.Dropdown>
        </Menu>
    );
};
