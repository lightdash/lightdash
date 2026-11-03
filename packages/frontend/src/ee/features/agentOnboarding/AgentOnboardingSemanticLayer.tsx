import {
    isAgentOnboardingRunTerminal,
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
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import { AI_NAME } from '../../../components/common/aiName';
import CodeBlock from '../../../components/common/CodeBlock/CodeBlock';
import {
    FIELD_ICONS,
    getItemIconName,
} from '../../../components/common/Filters/utils/fieldIconUtils';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './AgentOnboardingSemanticLayer.module.css';
import { useRunSemanticLayer } from './hooks/useAgentOnboarding';
import { type SemanticLayerField, type SemanticLayerModel } from './utils';

const METRIC_TYPE_LABELS: Partial<Record<string, string>> = {
    [MetricType.SUM]: 'Sum',
    [MetricType.COUNT]: 'Count',
    [MetricType.COUNT_DISTINCT]: 'Distinct count',
    [MetricType.SUM_DISTINCT]: 'Distinct sum',
    [MetricType.AVERAGE]: 'Average',
    [MetricType.AVERAGE_DISTINCT]: 'Distinct average',
    [MetricType.MIN]: 'Min',
    [MetricType.MAX]: 'Max',
    [MetricType.MEDIAN]: 'Median',
    [MetricType.PERCENTILE]: 'Percentile',
    [MetricType.NUMBER]: 'Formula',
};

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
                        <Text
                            fz="xs"
                            fw={500}
                            truncate
                            className={classes.fieldText}
                            title={field.description ?? undefined}
                        >
                            {field.label}
                        </Text>
                        {kind === 'metric' && field.type && (
                            <Text
                                fz="xs"
                                c="dimmed"
                                className={classes.fieldType}
                            >
                                {METRIC_TYPE_LABELS[field.type] ?? field.type}
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
    content: string | null;
    model: SemanticLayerModel | null;
    exploreHref: string | null;
}> = ({ file, content, model, exploreHref }) => {
    const [view, setView] = useState<'definitions' | 'yaml'>('definitions');
    const name = file.path.split('/').pop() ?? file.path;

    return (
        <Paper className={classes.model}>
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
                    {content !== null && (
                        <Tooltip
                            label={view === 'yaml' ? 'Hide YAML' : 'View YAML'}
                        >
                            <ActionIcon
                                variant={view === 'yaml' ? 'light' : 'subtle'}
                                color="gray"
                                size="sm"
                                aria-label="View YAML"
                                aria-pressed={view === 'yaml'}
                                onClick={() =>
                                    setView(
                                        view === 'yaml'
                                            ? 'definitions'
                                            : 'yaml',
                                    )
                                }
                            >
                                <MantineIcon icon={IconCode} size={14} />
                            </ActionIcon>
                        </Tooltip>
                    )}
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

            {view === 'yaml' && content !== null ? (
                <Box className={classes.code}>
                    <CodeBlock
                        code={content}
                        language="yaml"
                        withLineNumbers
                        withCopyButton
                    />
                </Box>
            ) : model ? (
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
export const RunSemanticLayer: FC<{ run: AgentOnboardingRun }> = ({ run }) => {
    const isLive = !isAgentOnboardingRunTerminal(run.status);
    const { files: modelFiles, contents, models } = useRunSemanticLayer(run);

    if (modelFiles.length === 0 && !isLive) return null;

    return (
        <Stack gap="sm">
            <Group justify="space-between" align="flex-end" gap="xs">
                <Box>
                    <Text fz="sm" fw={500}>
                        Your semantic layer
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Shared definitions that charts, dashboards and {AI_NAME}{' '}
                        all read from.
                    </Text>
                </Box>
            </Group>
            {modelFiles.length === 0 ? (
                <Box className={classes.empty}>
                    <Text fz="sm" c="dimmed">
                        Metrics and dimensions appear here once {AI_NAME} has
                        read your tables.
                    </Text>
                </Box>
            ) : (
                modelFiles.map((file, index) => (
                    <ModelCard
                        key={file.path}
                        file={file}
                        content={contents[index]}
                        model={models[index]}
                        exploreHref={
                            run.status === 'completed' && models[index]
                                ? `/projects/${run.projectUuid}/tables/${models[index].name}`
                                : null
                        }
                    />
                ))
            )}
        </Stack>
    );
};
