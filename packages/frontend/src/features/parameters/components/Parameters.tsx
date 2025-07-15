import {
    Box,
    Button,
    Menu,
    Select,
    Text,
    useMantineTheme,
} from '@mantine/core';
import {
    IconChevronDown,
    IconChevronUp,
    IconSettings,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useParameters } from '../../../hooks/parameters/useParameters';

type Props = {
    isEditMode: boolean;
};

export const Parameters: FC<Props> = ({ isEditMode }) => {
    const theme = useMantineTheme();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [showOpenIcon, setShowOpenIcon] = useState(false);
    const [parameterValues, setParameterValues] = useState<
        Record<string, string | null>
    >({});

    const { data: parameters, isLoading, isError } = useParameters(projectUuid);

    const parameterKeys = parameters ? Object.keys(parameters) : [];
    const selectedParametersCount = Object.values(parameterValues).filter(
        (value) => value !== null && value !== '',
    ).length;

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
                {isError ? (
                    <Menu.Item fz="xs" disabled>
                        Failed to load parameters
                    </Menu.Item>
                ) : parameterKeys.length === 0 ? (
                    <Menu.Item fz="xs" disabled>
                        No parameters available
                    </Menu.Item>
                ) : (
                    <>
                        <Menu.Label fz={10}>Parameters</Menu.Label>
                        {parameterKeys.map((paramKey) => {
                            const options =
                                parameters?.[paramKey]?.options || [];
                            return (
                                <Box key={paramKey} p="xs">
                                    <Text size="xs" fw={500} mb="xxs">
                                        {paramKey}
                                    </Text>
                                    <Select
                                        placeholder="Choose value..."
                                        value={
                                            parameterValues[paramKey] || null
                                        }
                                        onChange={(value) =>
                                            setParameterValues((prev) => ({
                                                ...prev,
                                                [paramKey]: value,
                                            }))
                                        }
                                        data={options}
                                        size="xs"
                                        searchable
                                        clearable
                                    />
                                </Box>
                            );
                        })}

                        {selectedParametersCount > 0 && (
                            <>
                                <Menu.Divider />
                                <Menu.Item
                                    fz="xs"
                                    onClick={() => setParameterValues({})}
                                >
                                    Clear All
                                </Menu.Item>
                            </>
                        )}
                    </>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};
