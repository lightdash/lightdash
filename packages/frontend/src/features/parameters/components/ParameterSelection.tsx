import {
    type LightdashProjectParameter,
    type ParametersValuesMap,
    type ParameterValue,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Flex,
    Group,
    SimpleGrid,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle, IconPin, IconPinFilled } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import { ParameterInput } from './ParameterInput';
import { ShadowedReservedNameWarning } from './ShadowedReservedNameWarning';

type ParameterSelectionProps = {
    parameters?: Record<string, LightdashProjectParameter>;
    missingRequiredParameters?: string[] | null;
    isLoading?: boolean;
    isError?: boolean;
    parameterValues: ParametersValuesMap;
    onParameterChange: (paramKey: string, value: ParameterValue | null) => void;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    showClearAll?: boolean;
    onClearAll?: () => void;
    cols?: number;
    projectUuid?: string;
    loadingMessage?: string;
    disabled?: boolean;
    isEditMode?: boolean;
    pinnedParameters?: string[];
    onParameterPin?: (paramKey: string) => void;
    shadowedReservedNames?: string[];
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
    missingRequiredParameters,
    isEditMode = false,
    pinnedParameters = [],
    onParameterPin,
    shadowedReservedNames = [],
}) => {
    const { t } = useTranslation('explorer');
    const parameterKeys = parameters ? Object.keys(parameters) : [];
    const selectedParametersCount = Object.values(parameterValues).filter(
        (value) => value !== null && value !== '',
    ).length;

    if (isLoading) {
        return (
            <Text size={size} c="dimmed">
                {t('parameters.selection.loading')}
            </Text>
        );
    }

    if (isError) {
        return (
            <Text size={size} c="dimmed">
                {t('parameters.selection.loadFailed')}
            </Text>
        );
    }

    if (parameterKeys.length === 0) {
        return (
            <Text size={size} c="dimmed">
                {t('parameters.selection.empty')}
            </Text>
        );
    }

    return (
        <Stack>
            <SimpleGrid cols={{ base: 1, sm: cols }} spacing="sm">
                {parameterKeys.map((paramKey) => {
                    const parameter = parameters?.[paramKey];
                    if (!parameter) {
                        return (
                            <Text key={paramKey}>
                                {t('parameters.selection.paramLoadFailed')}
                            </Text>
                        );
                    }
                    return (
                        <Box key={paramKey} miw={0}>
                            <Group align="center" gap="xs" mb="xxs">
                                <Group align="center" gap="xs">
                                    <Text
                                        size={size}
                                        fw={500}
                                        style={{ overflowWrap: 'anywhere' }}
                                    >
                                        {parameters?.[paramKey]?.label ||
                                            paramKey}
                                    </Text>
                                    {parameters?.[paramKey]?.description && (
                                        <Tooltip
                                            position="top"
                                            maw={350}
                                            label={
                                                parameters?.[paramKey]
                                                    ?.description
                                            }
                                        >
                                            <MantineIcon
                                                icon={IconInfoCircle}
                                                color="dimmed"
                                                size="sm"
                                            />
                                        </Tooltip>
                                    )}
                                    {shadowedReservedNames.includes(
                                        paramKey,
                                    ) && (
                                        <ShadowedReservedNameWarning
                                            paramKey={paramKey}
                                        />
                                    )}
                                </Group>
                                {isEditMode && onParameterPin && (
                                    <Tooltip
                                        label={
                                            pinnedParameters.includes(paramKey)
                                                ? t(
                                                      'parameters.selection.unpin',
                                                  )
                                                : t('parameters.selection.pin')
                                        }
                                        position="left"
                                    >
                                        <ActionIcon
                                            size="xs"
                                            variant={
                                                pinnedParameters.includes(
                                                    paramKey,
                                                )
                                                    ? 'filled'
                                                    : 'subtle'
                                            }
                                            color={
                                                pinnedParameters.includes(
                                                    paramKey,
                                                )
                                                    ? 'blue'
                                                    : 'gray'
                                            }
                                            onClick={() =>
                                                onParameterPin(paramKey)
                                            }
                                        >
                                            <MantineIcon
                                                icon={
                                                    pinnedParameters.includes(
                                                        paramKey,
                                                    )
                                                        ? IconPinFilled
                                                        : IconPin
                                                }
                                                size="sm"
                                            />
                                        </ActionIcon>
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
                                isError={missingRequiredParameters?.includes(
                                    paramKey,
                                )}
                            />
                        </Box>
                    );
                })}
            </SimpleGrid>

            {showClearAll && selectedParametersCount > 0 && onClearAll && (
                <Flex justify="flex-end">
                    <Tooltip
                        label={t('parameters.selection.clearAllTooltip')}
                        position="bottom"
                    >
                        <Button
                            variant="subtle"
                            size="xs"
                            c="gray"
                            onClick={onClearAll}
                            disabled={disabled}
                        >
                            {t('parameters.selection.clearAll')}
                        </Button>
                    </Tooltip>
                </Flex>
            )}
        </Stack>
    );
};
