import {
    isAgentOnboardingRunTerminal,
    type AgentOnboardingFile,
    type AgentOnboardingRun,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Paper,
    SegmentedControl,
    Skeleton,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconAbc,
    IconArrowRight,
    IconCalendar,
    IconHash,
    IconMathFunction,
    IconTable,
    IconToggleLeft,
    type Icon,
} from '@tabler/icons-react';
import { load } from 'js-yaml';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import { AI_NAME } from '../../../components/common/aiName';
import CodeBlock from '../../../components/common/CodeBlock/CodeBlock';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './AgentOnboardingSemanticLayer.module.css';
import { useAgentOnboardingFiles } from './hooks/useAgentOnboarding';
import {
    isSemanticLayerModelFile,
    toSemanticLayerModel,
    type SemanticLayerField,
    type SemanticLayerModel,
} from './utils';

const METRIC_TYPE_LABELS: Record<string, string> = {
    sum: 'Sum',
    count: 'Count',
    count_distinct: 'Distinct count',
    sum_distinct: 'Distinct sum',
    average: 'Average',
    average_distinct: 'Distinct average',
    min: 'Min',
    max: 'Max',
    median: 'Median',
    percentile: 'Percentile',
    number: 'Formula',
};

const DIMENSION_ICONS: Record<string, Icon> = {
    date: IconCalendar,
    timestamp: IconCalendar,
    number: IconHash,
    boolean: IconToggleLeft,
};

const parseModel = (path: string, content: string) => {
    try {
        return toSemanticLayerModel(path, load(content));
    } catch {
        // A file mid-write is not valid YAML yet
        return null;
    }
};

const pluralize = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? '' : 's'}`;

const FieldList: FC<{
    kind: 'metric' | 'dimension';
    fields: SemanticLayerField[];
}> = ({ kind, fields }) => (
    <Stack gap={6} className={classes.fieldColumn} data-kind={kind}>
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
                                kind === 'metric'
                                    ? IconMathFunction
                                    : (DIMENSION_ICONS[field.type ?? ''] ??
                                      IconAbc)
                            }
                            size={14}
                            className={classes.fieldIcon}
                        />
                        <Box className={classes.fieldText}>
                            <Text fz="sm" truncate>
                                {field.label}
                            </Text>
                            {field.description && (
                                <Text fz="xs" c="dimmed" truncate>
                                    {field.description}
                                </Text>
                            )}
                        </Box>
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
                    <Box className={classes.modelIcon}>
                        <MantineIcon icon={IconTable} size={16} />
                    </Box>
                    <Box miw={0}>
                        <Text fz="sm" fw={600} truncate>
                            {model?.label ?? name}
                        </Text>
                        <Text fz="xs" c="dimmed" truncate>
                            {model
                                ? [
                                      model.source && `From ${model.source}`,
                                      pluralize(model.metrics.length, 'metric'),
                                      pluralize(
                                          model.dimensions.length,
                                          'dimension',
                                      ),
                                  ]
                                      .filter(Boolean)
                                      .join(' · ')
                                : `Writing ${name}`}
                        </Text>
                    </Box>
                </Group>
                <Group gap="xs" wrap="nowrap">
                    {content !== null && (
                        <SegmentedControl
                            size="xs"
                            value={view}
                            onChange={(value) =>
                                setView(
                                    value === 'yaml' ? 'yaml' : 'definitions',
                                )
                            }
                            data={[
                                { value: 'definitions', label: 'Definitions' },
                                { value: 'yaml', label: 'YAML' },
                            ]}
                            aria-label={`View ${model?.label ?? name} as`}
                        />
                    )}
                    {exploreHref && (
                        <Button
                            size="xs"
                            variant="default"
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
                <>
                    {model.description && (
                        <Text fz="sm" c="dimmed">
                            {model.description}
                        </Text>
                    )}
                    <Box className={classes.columns}>
                        <FieldList kind="metric" fields={model.metrics} />
                        <FieldList kind="dimension" fields={model.dimensions} />
                    </Box>
                </>
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
    const modelFiles = run.files.filter(isSemanticLayerModelFile);
    const queries = useAgentOnboardingFiles(
        run.projectUuid,
        run.agentOnboardingRunUuid,
        modelFiles,
    );
    const contents = queries.map(({ data }) =>
        data?.encoding === 'utf8' ? data.content : null,
    );
    const models = modelFiles.map((file, index) => {
        const content = contents[index];
        return content === null ? null : parseModel(file.path, content);
    });

    if (modelFiles.length === 0 && !isLive) return null;

    const metricCount = models.reduce(
        (sum, model) => sum + (model?.metrics.length ?? 0),
        0,
    );
    const dimensionCount = models.reduce(
        (sum, model) => sum + (model?.dimensions.length ?? 0),
        0,
    );

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
                {metricCount + dimensionCount > 0 && (
                    <Text fz="xs" c="dimmed" className={classes.tabular}>
                        {pluralize(metricCount, 'metric')} ·{' '}
                        {pluralize(dimensionCount, 'dimension')}
                    </Text>
                )}
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
