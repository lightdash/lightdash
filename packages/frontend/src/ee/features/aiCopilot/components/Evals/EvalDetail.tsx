import type { ApiUpdateEvaluationRequest } from '@lightdash/common';
import {
    Box,
    Button,
    Center,
    Divider,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconArrowLeft, IconEdit, IconPlayerPlay } from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useAiAgentEvaluation,
    useAiAgentEvaluationRuns,
    useDeleteEvaluation,
    useRunEvaluation,
    useUpdateEvaluation,
} from '../../hooks/useAiAgentEvaluations';
import { EvalFormModal } from './EvalFormModal';
import { EvalPromptText } from './EvalPromptText';
import { EvalPromptThreadReference } from './EvalPromptThreadReference';
import { EvalRuns } from './EvalRuns';

type Props = {
    projectUuid: string;
    agentUuid: string;
    evalUuid: string;
};

export const EvalDetail: FC<Props> = ({ projectUuid, agentUuid, evalUuid }) => {
    const navigate = useNavigate();
    const { runUuid } = useParams<{ runUuid?: string }>();
    const [searchParams, setSearchParams] = useSearchParams();

    const { data: evaluation, isLoading: isLoadingEval } = useAiAgentEvaluation(
        projectUuid,
        agentUuid,
        evalUuid,
    );

    const { data: runsData } = useAiAgentEvaluationRuns(
        projectUuid,
        agentUuid,
        evalUuid,
    );

    const runEvaluationMutation = useRunEvaluation(projectUuid, agentUuid);
    const updateEvaluationMutation = useUpdateEvaluation(
        projectUuid,
        agentUuid,
    );
    const deleteEvaluationMutation = useDeleteEvaluation(
        projectUuid,
        agentUuid,
    );

    // Modal state from URL params
    const isEditModalOpen = searchParams.get('modal') === 'edit-eval';

    // Check if there's an active evaluation running
    const hasActiveRun = runsData?.data?.runs?.some(
        (run) => run.status === 'pending' || run.status === 'running',
    );

    const handleBack = () => {
        void navigate(`/projects/${projectUuid}/ai-agents/${agentUuid}/edit`);
    };

    const handleEditModalOpen = () => {
        const newParams = new URLSearchParams(searchParams);
        newParams.set('modal', 'edit-eval');
        setSearchParams(newParams);
    };

    const handleEditModalClose = () => {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('modal');
        setSearchParams(newParams);
    };

    const handleRunEvaluation = () => {
        void runEvaluationMutation.mutate(evalUuid);
    };

    if (isLoadingEval) {
        return (
            <Center p="md">
                <Loader />
            </Center>
        );
    }

    if (!evaluation) {
        return (
            <Stack gap="md">
                <Button
                    variant="subtle"
                    onClick={handleBack}
                    size="sm"
                    leftSection={<MantineIcon icon={IconArrowLeft} size="sm" />}
                ></Button>
                <Text>Evaluation not found</Text>
            </Stack>
        );
    }

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center">
                <Button
                    variant="subtle"
                    onClick={handleBack}
                    size="sm"
                    leftSection={<MantineIcon icon={IconArrowLeft} size="md" />}
                >
                    Evaluations
                </Button>
                <Button
                    leftSection={<MantineIcon icon={IconPlayerPlay} />}
                    size="sm"
                    loading={runEvaluationMutation.isLoading}
                    disabled={hasActiveRun || runEvaluationMutation.isLoading}
                    onClick={handleRunEvaluation}
                >
                    Run Evaluation
                </Button>
            </Group>

            <Paper p="md" withBorder>
                <Stack gap="md">
                    <Group justify="space-between" align="flex-start">
                        <Stack gap="xs" style={{ flex: 1 }}>
                            <Title order={4}>{evaluation.title}</Title>
                            {evaluation.description && (
                                <Text size="sm" c="dimmed">
                                    {evaluation.description}
                                </Text>
                            )}
                        </Stack>
                        <Button
                            variant="subtle"
                            size="sm"
                            leftSection={<MantineIcon icon={IconEdit} />}
                            onClick={handleEditModalOpen}
                        >
                            Edit
                        </Button>
                    </Group>

                    {evaluation.prompts && evaluation.prompts.length > 0 && (
                        <>
                            <Divider />
                            <Stack gap="sm">
                                <Title order={5}>Prompts</Title>
                                <Stack gap="xs">
                                    {evaluation.prompts.map((prompt, index) => (
                                        <Group
                                            key={prompt.evalPromptUuid}
                                            gap="sm"
                                            align="flex-start"
                                        >
                                            <Text
                                                size="sm"
                                                fw={500}
                                                c="dimmed"
                                                style={{ minWidth: 20 }}
                                            >
                                                {index + 1}.
                                            </Text>
                                            <Box style={{ flex: 1 }}>
                                                {prompt.type === 'string' ? (
                                                    <EvalPromptText
                                                        prompt={prompt.prompt}
                                                    />
                                                ) : prompt.type === 'thread' ? (
                                                    <EvalPromptThreadReference
                                                        projectUuid={
                                                            projectUuid
                                                        }
                                                        agentUuid={agentUuid}
                                                        threadUuid={
                                                            prompt.threadUuid
                                                        }
                                                        promptUuid={
                                                            prompt.promptUuid
                                                        }
                                                        openInSidebar={true}
                                                    />
                                                ) : (
                                                    <Text
                                                        size="sm"
                                                        c="dimmed"
                                                        fs="italic"
                                                    >
                                                        Invalid prompt
                                                        configuration
                                                    </Text>
                                                )}
                                            </Box>
                                        </Group>
                                    ))}
                                </Stack>
                            </Stack>
                        </>
                    )}
                </Stack>
            </Paper>

            <EvalRuns
                projectUuid={projectUuid}
                agentUuid={agentUuid}
                evalUuid={evalUuid}
                selectedRunUuid={runUuid}
            />

            {isEditModalOpen && evaluation && (
                <EvalFormModal
                    mode="edit"
                    evaluation={evaluation}
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    isOpened={isEditModalOpen}
                    onClose={handleEditModalClose}
                    onSubmit={(data) => {
                        updateEvaluationMutation.mutate(
                            {
                                evalUuid: evaluation.evalUuid,
                                data: data as ApiUpdateEvaluationRequest,
                            },
                            {
                                onSuccess: () => {
                                    handleEditModalClose();
                                },
                            },
                        );
                    }}
                    onDelete={() => {
                        void deleteEvaluationMutation.mutate(
                            evaluation.evalUuid,
                            {
                                onSuccess: () => {
                                    handleEditModalClose();
                                    void navigate(
                                        `/projects/${projectUuid}/ai-agents/${agentUuid}/edit`,
                                    );
                                },
                            },
                        );
                    }}
                    isLoading={updateEvaluationMutation.isLoading}
                    isDeleting={deleteEvaluationMutation.isLoading}
                />
            )}
        </Stack>
    );
};
