import {
    ActionIcon,
    Button,
    Group,
    Loader,
    NumberInput,
    Select,
    Stack,
    Text,
} from '@mantine-8/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import {
    addStep,
    removeStep,
    selectConversionWindowUnit,
    selectConversionWindowValue,
    selectEventNames,
    selectEventNamesLoading,
    selectSteps,
    setConversionWindowUnit,
    setConversionWindowValue,
    updateStepEventName,
} from '../store/funnelBuilderSlice';

export const FunnelStepsTab: FC = () => {
    const dispatch = useAppDispatch();

    const steps = useAppSelector(selectSteps);
    const eventNames = useAppSelector(selectEventNames);
    const isLoadingEventNames = useAppSelector(selectEventNamesLoading);
    const conversionWindowValue = useAppSelector(selectConversionWindowValue);
    const conversionWindowUnit = useAppSelector(selectConversionWindowUnit);

    return (
        <Stack gap="md">
            <Text fw={600} size="sm">
                Funnel Steps
            </Text>

            {isLoadingEventNames && <Loader size="sm" />}

            {steps.map((step, index) => {
                // Filter out events already selected in previous steps
                const previousEventNames = steps
                    .slice(0, index)
                    .map((s) => s.eventName)
                    .filter(Boolean);
                const availableEvents = eventNames
                    .filter((e) => !previousEventNames.includes(e))
                    .sort((a, b) => a.localeCompare(b))
                    .map((e) => ({ value: e, label: e }));

                return (
                    <Group key={step.stepOrder} gap="xs" wrap="nowrap">
                        <Text size="sm" w={50}>
                            Step {step.stepOrder}
                        </Text>
                        <Select
                            placeholder="Select event"
                            searchable
                            data={availableEvents}
                            value={step.eventName || null}
                            onChange={(val) =>
                                dispatch(
                                    updateStepEventName({
                                        index,
                                        eventName: val ?? '',
                                    }),
                                )
                            }
                            disabled={!eventNames.length}
                            flex={1}
                        />
                        {steps.length > 1 && (
                            <ActionIcon
                                variant="subtle"
                                color="red"
                                onClick={() => dispatch(removeStep(index))}
                            >
                                <IconTrash size={16} />
                            </ActionIcon>
                        )}
                    </Group>
                );
            })}

            <Button
                variant="light"
                leftSection={<IconPlus size={16} />}
                onClick={() => dispatch(addStep())}
                disabled={!eventNames.length}
            >
                Add Step
            </Button>

            <Text fw={600} size="sm" mt="md">
                Conversion Window
            </Text>

            <Group gap="xs">
                <NumberInput
                    value={conversionWindowValue}
                    onChange={(val) =>
                        dispatch(setConversionWindowValue(Number(val) || 7))
                    }
                    min={1}
                    max={365}
                    w={80}
                />
                <Select
                    value={conversionWindowUnit}
                    onChange={(val) =>
                        dispatch(
                            setConversionWindowUnit(
                                val as 'hours' | 'days' | 'weeks',
                            ),
                        )
                    }
                    data={[
                        { value: 'hours', label: 'Hours' },
                        { value: 'days', label: 'Days' },
                        { value: 'weeks', label: 'Weeks' },
                    ]}
                    w={100}
                />
            </Group>
        </Stack>
    );
};
