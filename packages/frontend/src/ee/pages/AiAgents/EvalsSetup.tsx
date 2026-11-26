import type {
    AiAgentEvaluationRunSummary,
    AiAgentEvaluationSummary,
    ApiCreateEvaluationRequest,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Button,
    Group,
    Loader,
    LoadingOverlay,
    Paper,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine/core';
import { IconList, IconPlayerPlay, IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link, useSearchParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { EvalFormModal } from '../../features/aiCopilot/components/Evals/EvalFormModal';
import {
    hasActiveEvaluationRun,
    useAiAgentEvaluationRunResults,
    useAiAgentEvaluationRuns,
    useAiAgentEvaluations,
    useCreateEvaluation,
    useRunAllEvaluations,
} from '../../features/aiCopilot/hooks/useAiAgentEvaluations';

type Props = {
    projectUuid: string;
    agentUuid: string;
};

const EvaluationRunLink: FC<
    Props & {
        run: AiAgentEvaluationRunSummary | undefined;
        evaluationPath: string;
    }
> = ({ projectUuid, agentUuid, run, evaluationPath }) => {
    const isActive = !!run && hasActiveEvaluationRun([run]);
    const { data: runDetails } = useAiAgentEvaluationRunResults(
        projectUuid,
        agentUuid,
        run?.evalUuid,
        run?.runUuid,
        { enabled: isActive, pollWhileActive: true },
    );

    if (!run) return <Text c="dimmed">—</Text>;

    const prompts = runDetails?.results ?? [];
    const finished = prompts.filter(
        ({ status }) => status === 'completed' || status === 'failed',
    ).length;
    const hasStarted =
        run.status === 'running' ||
        prompts.some(({ status }) => status !== 'pending');
    const runPath = `${evaluationPath}/run/${run.runUuid}`;

    if (isActive) {
        const progress =
            prompts.length > 0
                ? `${finished} of ${prompts.length} prompts finished`
                : 'Checking prompt status';

        return (
            <Stack gap={4}>
                <Anchor component={Link} to={runPath} size="sm">
                    <Badge
                        variant="light"
                        color={hasStarted ? 'blue' : 'gray'}
                        leftSection={<Loader size={10} color="currentColor" />}
                    >
                        {hasStarted ? 'In progress' : 'Queued'}
                    </Badge>
                </Anchor>
                <Text size="xs" c="dimmed">
                    {hasStarted || !runDetails
                        ? progress
                        : 'Waiting for a worker'}
                </Text>
            </Stack>
        );
    }

    return (
        <Anchor component={Link} to={runPath} size="sm">
            {run.status === 'completed'
                ? `${run.passedAssessments} passed · ${run.failedAssessments} failed`
                : 'Run failed'}
        </Anchor>
    );
};

const EvaluationRow: FC<
    Props & { evaluation: AiAgentEvaluationSummary; submissionFailed: boolean }
> = ({ projectUuid, agentUuid, evaluation, submissionFailed }) => {
    const { evalUuid, title, description, createdAt } = evaluation;
    const evaluationPath = `/projects/${projectUuid}/ai-agents/${agentUuid}/edit/evals/${evalUuid}`;
    const { data, isLoading, isError } = useAiAgentEvaluationRuns(
        projectUuid,
        agentUuid,
        evalUuid,
        { pollWhileActive: true },
    );
    const [latestRun, previousRun] = data?.data?.runs ?? [];

    return (
        <Table.Tr>
            <Table.Td>
                <Stack gap={4}>
                    <Anchor
                        component={Link}
                        to={evaluationPath}
                        size="sm"
                        fw={500}
                    >
                        {title}
                    </Anchor>
                    {description && (
                        <Text size="sm" c="dimmed" lineClamp={2}>
                            {description}
                        </Text>
                    )}
                    <Text size="xs" c="dimmed">
                        Created {new Date(createdAt).toLocaleDateString()}
                    </Text>
                    {submissionFailed && (
                        <Text size="sm" c="red">
                            Could not confirm this suite was queued
                        </Text>
                    )}
                </Stack>
            </Table.Td>
            {isLoading || isError ? (
                <Table.Td colSpan={2}>
                    <Text size="sm" c="dimmed">
                        {isError ? 'Could not load runs' : 'Loading runs…'}
                    </Text>
                </Table.Td>
            ) : (
                <>
                    <Table.Td>
                        <EvaluationRunLink
                            projectUuid={projectUuid}
                            agentUuid={agentUuid}
                            run={latestRun}
                            evaluationPath={evaluationPath}
                        />
                    </Table.Td>
                    <Table.Td>
                        <EvaluationRunLink
                            projectUuid={projectUuid}
                            agentUuid={agentUuid}
                            run={previousRun}
                            evaluationPath={evaluationPath}
                        />
                    </Table.Td>
                </>
            )}
        </Table.Tr>
    );
};

export const EvalsSetup: FC<Props> = ({ projectUuid, agentUuid }) => {
    const [searchParams, setSearchParams] = useSearchParams();

    const { data: evaluations, isLoading } = useAiAgentEvaluations(
        projectUuid,
        agentUuid,
    );

    const createEvaluationMutation = useCreateEvaluation(
        projectUuid,
        agentUuid,
    );

    const runAll = useRunAllEvaluations(projectUuid, agentUuid);

    // Modal state from URL params
    const isCreateModalOpen = searchParams.get('modal') === 'create-eval';

    const handleCreateModalClose = () => {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('modal');
        setSearchParams(newParams);
    };

    const handleCreateModalOpen = () => {
        const newParams = new URLSearchParams(searchParams);
        newParams.set('modal', 'create-eval');
        setSearchParams(newParams);
    };

    const evalCreationModal = isCreateModalOpen ? (
        <EvalFormModal
            mode="create"
            projectUuid={projectUuid}
            agentUuid={agentUuid}
            isOpened={isCreateModalOpen}
            onClose={handleCreateModalClose}
            onSubmit={(data) => {
                createEvaluationMutation.mutate(
                    data as ApiCreateEvaluationRequest,
                    {
                        onSuccess: () => {
                            handleCreateModalClose();
                        },
                    },
                );
            }}
            isLoading={createEvaluationMutation.isLoading}
        />
    ) : null;

    if (isLoading) {
        return <LoadingOverlay visible loaderProps={{ size: 'lg' }} />;
    }

    if (!evaluations || evaluations.length === 0) {
        return (
            <Stack gap="sm">
                <Paper
                    variant="dotted"
                    p="xl"
                    component={Stack}
                    gap="md"
                    align="center"
                >
                    <MantineIcon icon={IconList} size="lg" color="dimmed" />
                    <Stack gap="xs" align="center">
                        <Title order={5}>No evaluations found</Title>
                        <Text size="sm" c="dimmed" ta="center" maw={400}>
                            Create an evaluation to start testing your AI agent
                            with predefined prompts and measure its performance.
                        </Text>
                    </Stack>
                    <Button
                        leftSection={<MantineIcon icon={IconPlus} />}
                        size="sm"
                        onClick={handleCreateModalOpen}
                        mt="sm"
                    >
                        Create Evaluation
                    </Button>
                </Paper>
                {evalCreationModal}
            </Stack>
        );
    }

    return (
        <Stack gap="sm">
            <Group justify="flex-end">
                <Button
                    variant="default"
                    size="sm"
                    leftSection={<MantineIcon icon={IconPlayerPlay} />}
                    loading={runAll.isSubmitting}
                    onClick={() =>
                        runAll.mutate(
                            evaluations.map(({ evalUuid }) => evalUuid),
                        )
                    }
                >
                    Run all evaluations
                </Button>
            </Group>
            {runAll.data && (
                <Text size="sm" c="dimmed" role="status">
                    {runAll.data.queued} submitted · {runAll.data.skipped}{' '}
                    already active
                    {runAll.data.failures.length > 0 &&
                        ` · ${runAll.data.failures.length} unconfirmed`}
                </Text>
            )}
            <Paper>
                <Table.ScrollContainer minWidth={480}>
                    <Table>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Evaluation</Table.Th>
                                <Table.Th>Latest run</Table.Th>
                                <Table.Th>Previous run</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {evaluations.map((evaluation) => (
                                <EvaluationRow
                                    key={evaluation.evalUuid}
                                    projectUuid={projectUuid}
                                    agentUuid={agentUuid}
                                    evaluation={evaluation}
                                    submissionFailed={
                                        runAll.data?.failures.includes(
                                            evaluation.evalUuid,
                                        ) ?? false
                                    }
                                />
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            </Paper>

            {evalCreationModal}
        </Stack>
    );
};
