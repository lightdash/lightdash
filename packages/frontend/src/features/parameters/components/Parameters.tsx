import { Box, Button, Menu, Text, useMantineTheme } from '@mantine/core';
import {
    IconChevronDown,
    IconChevronUp,
    IconSettings,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
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

    const { data: parameters, isLoading, isError } = useParameters(projectUuid);

    if (isEditMode) {
        return null;
    }

    return (
        <Menu
            withinPortal
            withArrow
            closeOnItemClick={false}
            closeOnClickOutside
            offset={-1}
            position="bottom-end"
            disabled={isEditMode || isLoading}
            onOpen={() => setShowOpenIcon(true)}
            onClose={() => setShowOpenIcon(false)}
        >
            <Menu.Target>
                <Button
                    size="xs"
                    variant="default"
                    loaderPosition="center"
                    loading={isLoading}
                    disabled={isEditMode || isLoading}
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
                        isLoading={isLoading}
                        isError={isError}
                        parameterValues={parameterValues}
                        onParameterChange={handleParameterChange}
                        size="xs"
                        showClearAll={selectedParametersCount > 0}
                        onClearAll={clearAllParameters}
                        cols={1}
                        projectUuid={projectUuid}
                    />
                </Box>
            </Menu.Dropdown>
        </Menu>
    );
};
