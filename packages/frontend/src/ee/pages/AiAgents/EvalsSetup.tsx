import type { ApiCreateEvaluationRequest } from '@lightdash/common';
import {
    Button,
    Card,
    Group,
    LoadingOverlay,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconChevronRight, IconList, IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link, useSearchParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { EvalFormModal } from '../../features/aiCopilot/components/Evals/EvalFormModal';
import {
    useAiAgentEvaluations,
    useCreateEvaluation,
} from '../../features/aiCopilot/hooks/useAiAgentEvaluations';

type Props = {
    projectUuid: string;
    agentUuid: string;
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
                    p="xl"
                    component={Stack}
                    gap="md"
                    align="center"
                    withBorder
                    style={{
                        borderStyle: 'dashed',
                        backgroundColor: 'transparent',
                    }}
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
            <Stack gap="sm">
                {evaluations.map((evaluation) => (
                    <Card
                        key={evaluation.evalUuid}
                        p="md"
                        withBorder
                        component={Link}
                        to={`/projects/${projectUuid}/ai-agents/${agentUuid}/edit/evals/${evaluation.evalUuid}`}
                    >
                        <Group justify="space-between" align="flex-start">
                            <Stack gap="xs" style={{ flex: 1 }}>
                                <Group gap="xs" align="center">
                                    <Title order={5} lineClamp={1}>
                                        {evaluation.title}
                                    </Title>
                                </Group>
                                {evaluation.description && (
                                    <Text size="sm" c="dimmed" lineClamp={2}>
                                        {evaluation.description}
                                    </Text>
                                )}
                                <Text size="xs" c="dimmed">
                                    Created{' '}
                                    {new Date(
                                        evaluation.createdAt,
                                    ).toLocaleDateString()}
                                </Text>
                            </Stack>

                            <MantineIcon
                                icon={IconChevronRight}
                                color="dimmed"
                                size="sm"
                            />
                        </Group>
                    </Card>
                ))}
            </Stack>

            {evalCreationModal}
        </Stack>
    );
};
