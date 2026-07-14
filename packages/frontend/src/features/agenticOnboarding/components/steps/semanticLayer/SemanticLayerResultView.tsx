import { type SemanticLayerResult } from '@lightdash/common';
import {
    Badge,
    Button,
    Divider,
    Group,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconArrowRight } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import Callout from '../../../../../components/common/Callout';
import MantineIcon from '../../../../../components/common/MantineIcon';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { useUpdateSemanticLayerField } from '../../../hooks/useUpdateSemanticLayerField';
import StepPanel from '../StepPanel';
import FieldsTable, { type EditableField } from './FieldsTable';

type SemanticLayerResultViewProps = {
    initialResult: SemanticLayerResult;
    projectUuid: string;
    onContinue: () => void;
};

type FieldType = 'metric' | 'dimension';

const applyFieldChange = (
    result: SemanticLayerResult,
    exploreName: string,
    fieldType: FieldType,
    fieldName: string,
    change: { label?: string; hidden?: boolean },
): SemanticLayerResult => ({
    ...result,
    explores: result.explores.map((explore) =>
        explore.name !== exploreName
            ? explore
            : {
                  ...explore,
                  metrics:
                      fieldType === 'metric'
                          ? explore.metrics.map((metric) =>
                                metric.name === fieldName
                                    ? { ...metric, ...change }
                                    : metric,
                            )
                          : explore.metrics,
                  dimensions:
                      fieldType === 'dimension'
                          ? explore.dimensions.map((dimension) =>
                                dimension.name === fieldName
                                    ? { ...dimension, ...change }
                                    : dimension,
                            )
                          : explore.dimensions,
              },
    ),
});

const SemanticLayerResultView: FC<SemanticLayerResultViewProps> = ({
    initialResult,
    projectUuid,
    onContinue,
}) => {
    const { showToastError } = useToaster();
    const [result, setResult] = useState<SemanticLayerResult>(initialResult);
    const updateField = useUpdateSemanticLayerField(projectUuid);

    const runUpdate = (
        exploreName: string,
        fieldType: FieldType,
        field: EditableField,
        change: { label?: string; hidden?: boolean },
    ) => {
        const previous = result;
        setResult(
            applyFieldChange(
                previous,
                exploreName,
                fieldType,
                field.name,
                change,
            ),
        );
        updateField
            .mutateAsync({
                exploreName,
                fieldType,
                fieldName: field.name,
                label: change.label ?? null,
                hidden: change.hidden ?? null,
            })
            .then((serverResult) => setResult(serverResult))
            .catch((error) => {
                setResult(previous);
                showToastError({
                    title: 'Could not save your change',
                    subtitle: error?.error?.message,
                });
            });
    };

    const metricCount = result.explores.reduce(
        (total, explore) => total + explore.metrics.length,
        0,
    );
    const dimensionCount = result.explores.reduce(
        (total, explore) => total + explore.dimensions.length,
        0,
    );

    const summary = `${metricCount} metrics and ${dimensionCount} dimensions across ${
        result.explores.length
    } explores · ${result.skippedTableCount} tables skipped`;

    return (
        <StepPanel title="Your semantic layer">
            <Stack gap="lg">
                {result.validationErrors.length === 0 ? (
                    <Badge color="green" variant="light" size="lg">
                        Validated with 0 errors
                    </Badge>
                ) : (
                    <Callout
                        variant="warning"
                        title={`Validated with ${result.validationErrors.length} warning(s)`}
                    >
                        <Stack gap={2}>
                            {result.validationErrors.map((validationError) => (
                                <Text
                                    key={`${validationError.exploreName}-${validationError.message}`}
                                    size="sm"
                                >
                                    {validationError.exploreName}:{' '}
                                    {validationError.message}
                                </Text>
                            ))}
                        </Stack>
                    </Callout>
                )}

                <Text size="sm" c="dimmed">
                    {summary}
                </Text>

                {result.explores.map((explore) => (
                    <Stack key={explore.name} gap="md">
                        <Divider label={explore.label} labelPosition="left" />
                        <Stack gap="xs">
                            <Title order={6}>Metrics</Title>
                            <FieldsTable
                                caption="Metric"
                                fields={explore.metrics}
                                disabled={updateField.isLoading}
                                onRename={(field, label) =>
                                    runUpdate(explore.name, 'metric', field, {
                                        label,
                                    })
                                }
                                onToggleHidden={(field, hidden) =>
                                    runUpdate(explore.name, 'metric', field, {
                                        hidden,
                                    })
                                }
                            />
                        </Stack>
                        <Stack gap="xs">
                            <Title order={6}>Dimensions</Title>
                            <FieldsTable
                                caption="Dimension"
                                fields={explore.dimensions}
                                disabled={updateField.isLoading}
                                onRename={(field, label) =>
                                    runUpdate(
                                        explore.name,
                                        'dimension',
                                        field,
                                        { label },
                                    )
                                }
                                onToggleHidden={(field, hidden) =>
                                    runUpdate(
                                        explore.name,
                                        'dimension',
                                        field,
                                        { hidden },
                                    )
                                }
                            />
                        </Stack>
                    </Stack>
                ))}

                <Text size="sm" c="dimmed">
                    You can change these later — rename or switch off anything,
                    and every chart stays in sync.
                </Text>

                <Group justify="flex-end">
                    <Button
                        rightSection={<MantineIcon icon={IconArrowRight} />}
                        onClick={onContinue}
                    >
                        Build my dashboard
                    </Button>
                </Group>
            </Stack>
        </StepPanel>
    );
};

export default SemanticLayerResultView;
