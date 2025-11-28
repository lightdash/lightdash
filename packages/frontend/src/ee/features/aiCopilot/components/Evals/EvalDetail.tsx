import type { ApiUpdateEvaluationRequest } from '@lightdash/common';
import {
    Box,
    Button,
    Center,
    Group,
    Loader,
    Paper,
    ScrollArea,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import {
    IconArrowLeft,
    IconEdit,
    IconInfoCircle,
    IconTarget,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useAiAgentEvaluation,
    useDeleteEvaluation,
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
    const [searchParams, setSearchParams] = useSearchParams();

    const { data: evaluation, isLoading: isLoadingEval } = useAiAgentEvaluation(
        projectUuid,
        agentUuid,
        evalUuid,
    );

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
        <Stack gap="xs">
            <Paper>
                <Stack>
                    {evaluation.prompts && evaluation.prompts.length > 0 && (
                        <>
                            <Stack gap="sm" p="sm">
                                <Group justify="space-between" align="center">
                                    <Group align="center" gap="xs">
                                        <Paper p="xxs" withBorder radius="sm">
                                            <MantineIcon
                                                icon={IconTarget}
                                                size="md"
                                            />
                                        </Paper>
                                        <Group gap="two">
                                            <Title
                                                order={6}
                                                c="ldGray.8"
                                                fw={500}
                                            >
                                                Test Prompts
                                            </Title>
                                            <Tooltip
                                                label={
                                                    <>
                                                        {evaluation.description && (
                                                            <Text fz="xs">
                                                                {
                                                                    evaluation.description
                                                                }
                                                            </Text>
                                                        )}

                                                        <Text fz="xs">
                                                            Created{' '}
                                                            {new Date(
                                                                evaluation.createdAt,
                                                            ).toLocaleDateString()}
                                                        </Text>
                                                    </>
                                                }
                                            >
                                                <MantineIcon
                                                    icon={IconInfoCircle}
                                                    color="ldGray.6"
                                                />
                                            </Tooltip>
                                        </Group>
                                    </Group>
                                    <Button
                                        variant="subtle"
                                        size="sm"
                                        leftSection={
                                            <MantineIcon icon={IconEdit} />
                                        }
                                        onClick={handleEditModalOpen}
                                    >
                                        Edit
                                    </Button>
                                </Group>
                                <ScrollArea.Autosize
                                    mah={230}
                                    scrollbars="y"
                                    offsetScrollbars="y"
                                    type="scroll"
                                    scrollbarSize={4}
                                >
                                    <Stack
                                        gap="sm"
                                        style={{
                                            boxSizing: 'border-box',
                                        }}
                                    >
                                        {evaluation.prompts.map((prompt) => (
                                            <Group
                                                gap="sm"
                                                align="flex-start"
                                                key={prompt.evalPromptUuid}
                                            >
                                                <Box style={{ flex: 1 }}>
                                                    {prompt.type ===
                                                    'string' ? (
                                                        <EvalPromptText
                                                            prompt={
                                                                prompt.prompt
                                                            }
                                                        />
                                                    ) : prompt.type ===
                                                      'thread' ? (
                                                        <EvalPromptThreadReference
                                                            projectUuid={
                                                                projectUuid
                                                            }
                                                            agentUuid={
                                                                agentUuid
                                                            }
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
                                </ScrollArea.Autosize>
                            </Stack>
                        </>
                    )}
                </Stack>
            </Paper>

            <EvalRuns
                projectUuid={projectUuid}
                agentUuid={agentUuid}
                evalUuid={evalUuid}
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
