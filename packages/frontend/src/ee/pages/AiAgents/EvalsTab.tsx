import type { ApiCreateEvaluationRequest } from '@lightdash/common';
import {
    Box,
    Button,
    Card,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconChevronRight, IconList, IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
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

export const EvalsTab: FC<Props> = ({ projectUuid, agentUuid }) => {
    const navigate = useNavigate();
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
        return (
            <Box style={{ display: 'flex', justifyContent: 'center', p: 20 }}>
                <Loader />
            </Box>
        );
    }

    if (!evaluations || evaluations.length === 0) {
        return (
            <>
                <Paper
                    p="xl"
                    shadow="subtle"
                    component={Stack}
                    gap="xxs"
                    align="center"
                    withBorder
                    style={{ borderStyle: 'dashed' }}
                >
                    <MantineIcon icon={IconList} size="lg" color="dimmed" />
                    <Title order={5}>No evaluations found</Title>
                    <Text size="sm" c="dimmed" ta="center">
                        Create an evaluation to start testing your AI agent with
                        predefined prompts.
                    </Text>
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
            </>
        );
    }

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center">
                <Title order={4}>Evaluations</Title>
                <Button
                    leftSection={<MantineIcon icon={IconPlus} />}
                    size="sm"
                    onClick={handleCreateModalOpen}
                >
                    Create Evaluation
                </Button>
            </Group>

            <Stack gap="sm">
                {evaluations.map((evaluation) => (
                    <Card
                        key={evaluation.evalUuid}
                        p="md"
                        withBorder
                        style={{ cursor: 'pointer' }}
                        onClick={() =>
                            navigate(
                                `/projects/${projectUuid}/ai-agents/${agentUuid}/edit/evals/${evaluation.evalUuid}`,
                            )
                        }
                    >
                        <Group justify="space-between" align="center">
                            <Stack gap="xs" style={{ flex: 1 }}>
                                <Group gap="xs">
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

                            <MantineIcon icon={IconChevronRight} />
                        </Group>
                    </Card>
                ))}
            </Stack>
            {evalCreationModal}
        </Stack>
    );
};
