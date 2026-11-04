import {
    MetricType,
    type AgentOnboardingFile,
    type AgentOnboardingRun,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Paper,
    Skeleton,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconArrowRight, IconCode, IconTable } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import {
    FIELD_ICONS,
    getItemIconName,
} from '../../../components/common/Filters/utils/fieldIconUtils';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './AgentOnboardingSemanticLayer.module.css';
import { useRunSemanticLayer } from './hooks/useAgentOnboarding';
import {
    SEMANTIC_LAYER_ANCHOR,
    type SemanticLayerField,
    type SemanticLayerModel,
} from './utils';

// Fallback when the model has no description of its own
const METRIC_TYPE_LABELS: Partial<Record<string, string>> = {
    [MetricType.SUM]: 'Total',
    [MetricType.COUNT]: 'Count of rows',
    [MetricType.COUNT_DISTINCT]: 'Unique count',
    [MetricType.SUM_DISTINCT]: 'Total of unique values',
    [MetricType.AVERAGE]: 'Average',
    [MetricType.AVERAGE_DISTINCT]: 'Average of unique values',
    [MetricType.MIN]: 'Smallest value',
    [MetricType.MAX]: 'Largest value',
    [MetricType.MEDIAN]: 'Median',
    [MetricType.PERCENTILE]: 'Percentile',
    [MetricType.NUMBER]: 'Calculated from other metrics',
};

const explainMetric = ({ description, type }: SemanticLayerField) =>
    description ?? (type ? (METRIC_TYPE_LABELS[type] ?? null) : null);

const FieldList: FC<{
    kind: 'metric' | 'dimension';
    fields: SemanticLayerField[];
}> = ({ kind, fields }) => (
    <Stack gap={2} className={classes.fieldColumn} data-kind={kind}>
        <Text fz="xs" c="dimmed">
            {kind === 'metric' ? 'Metrics' : 'Dimensions'}
        </Text>
        {fields.length === 0 ? (
            <Text fz="xs" c="dimmed">
                None yet
            </Text>
        ) : (
            <Box component="ul" className={classes.fields}>
                {fields.map((field) => (
                    <Box
                        component="li"
                        key={field.name}
                        className={classes.field}
                    >
                        <MantineIcon
                            icon={
                                FIELD_ICONS[
                                    field.type
                                        ? getItemIconName(field.type)
                                        : 'numerical'
                                ]
                            }
                            size={13}
                            className={classes.fieldIcon}
                        />
                        {kind === 'metric' ? (
                            <Box className={classes.fieldText}>
                                <Text fz="xs" fw={500} truncate>
                                    {field.label}
                                </Text>
                                {explainMetric(field) && (
                                    <Text fz="xs" c="dimmed" lineClamp={2}>
                                        {explainMetric(field)}
                                    </Text>
                                )}
                            </Box>
                        ) : (
                            <Text
                                fz="xs"
                                fw={500}
                                truncate
                                className={classes.fieldText}
                                title={field.description ?? undefined}
                            >
                                {field.label}
                            </Text>
                        )}
                    </Box>
                ))}
            </Box>
        )}
    </Stack>
);

const ModelCard: FC<{
    file: AgentOnboardingFile;
    model: SemanticLayerModel | null;
    exploreHref: string | null;
    isInspected: boolean;
    onViewCode: () => void;
}> = ({ file, model, exploreHref, isInspected, onViewCode }) => {
    const name = file.path.split('/').pop() ?? file.path;

    return (
        <Paper className={classes.model} data-inspected={isInspected}>
            <Group justify="space-between" wrap="nowrap" gap="sm">
                <Group gap="sm" wrap="nowrap" miw={0}>
                    <MantineIcon
                        icon={IconTable}
                        size={16}
                        className={classes.modelIcon}
                    />
                    <Box miw={0}>
                        <Text fz="sm" fw={500} truncate>
                            {model?.label ?? name}
                        </Text>
                        {!model && (
                            <Text fz="xs" c="dimmed" truncate>
                                Writing {name}
                            </Text>
                        )}
                    </Box>
                </Group>
                <Group gap="xs" wrap="nowrap">
                    <Tooltip label="View YAML">
                        <ActionIcon
                            variant={isInspected ? 'light' : 'subtle'}
                            color="gray"
                            size="sm"
                            aria-label={`View ${model?.label ?? name} YAML`}
                            aria-pressed={isInspected}
                            onClick={onViewCode}
                        >
                            <MantineIcon icon={IconCode} size={14} />
                        </ActionIcon>
                    </Tooltip>
                    {exploreHref && (
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            color="gray"
                            component={Link}
                            to={exploreHref}
                            rightSection={
                                <MantineIcon icon={IconArrowRight} size={12} />
                            }
                            visibleFrom="sm"
                        >
                            Explore
                        </Button>
                    )}
                </Group>
            </Group>

            {model ? (
                <Box className={classes.columns}>
                    <FieldList kind="metric" fields={model.metrics} />
                    <FieldList kind="dimension" fields={model.dimensions} />
                </Box>
            ) : (
                <Stack gap={8}>
                    <Skeleton h={10} w="40%" />
                    <Skeleton h={10} w="65%" />
                    <Skeleton h={10} w="55%" />
                </Stack>
            )}
        </Paper>
    );
};

/** The models the run wrote, shown as the metrics and dimensions they define, with the YAML one click away */
export const RunSemanticLayer: FC<{
    run: AgentOnboardingRun;
    inspectedPath: string | null;
    onViewCode: (path: string) => void;
}> = ({ run, inspectedPath, onViewCode }) => {
    const { files: modelFiles, models } = useRunSemanticLayer(run);
    if (modelFiles.length === 0) return null;

    return (
        <Stack gap="sm" id={SEMANTIC_LAYER_ANCHOR} className={classes.section}>
            {modelFiles.map((file, index) => (
                <ModelCard
                    key={file.path}
                    file={file}
                    model={models[index]}
                    exploreHref={
                        run.status === 'completed' && models[index]
                            ? `/projects/${run.projectUuid}/tables/${models[index].name}`
                            : null
                    }
                    isInspected={inspectedPath === file.path}
                    onViewCode={() => onViewCode(file.path)}
                />
            ))}
        </Stack>
    );
};
