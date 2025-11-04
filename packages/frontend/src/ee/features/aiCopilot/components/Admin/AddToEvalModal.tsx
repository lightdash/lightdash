import {
    type ApiAppendEvaluationRequest,
    type ApiCreateEvaluationRequest,
} from '@lightdash/common';
import {
    Button,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import {
    useAiAgentEvaluations,
    useAppendToEvaluation,
    useCreateEvaluation,
} from '../../hooks/useAiAgentEvaluations';

type AddToEvalModalProps = {
    isOpen: boolean;
    onClose: () => void;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
};

export const AddToEvalModal: FC<AddToEvalModalProps> = ({
    isOpen,
    onClose,
    projectUuid,
    agentUuid,
    threadUuid,
    promptUuid,
}) => {
    const [createMode, setCreateMode] = useState(false);

    const { data: evaluations, isLoading: isLoadingEvals } =
        useAiAgentEvaluations(projectUuid, agentUuid);

    const createEvaluationMutation = useCreateEvaluation(
        projectUuid,
        agentUuid,
        { showToastButton: true },
    );
    const appendToEvaluationMutation = useAppendToEvaluation(
        projectUuid,
        agentUuid,
    );

    const form = useForm({
        initialValues: {
            selectedEvalUuid: '',
            newEvalName: '',
        },
        validate: {
            selectedEvalUuid: (value: string) =>
                !createMode && !value ? 'Please select an evaluation' : null,
            newEvalName: (value: string) =>
                createMode && !value ? 'Please enter an evaluation name' : null,
        },
    });

    const handleSubmit = async (values: typeof form.values) => {
        const promptData = {
            promptUuid,
            threadUuid,
            expectedResponse: null,
        };

        try {
            if (createMode) {
                // Create new evaluation with the prompt
                const createData: ApiCreateEvaluationRequest = {
                    title: values.newEvalName,
                    prompts: [promptData],
                };
                await createEvaluationMutation.mutateAsync(createData);
            } else {
                // Add prompt to existing evaluation
                const appendData: ApiAppendEvaluationRequest = {
                    prompts: [promptData],
                };
                await appendToEvaluationMutation.mutateAsync({
                    evalUuid: values.selectedEvalUuid,
                    data: appendData,
                });
            }
            onClose();
            form.reset();
            setCreateMode(false);
        } catch (error) {
            // Error is handled by the mutation
        }
    };

    return (
        <MantineModal
            opened={isOpen}
            onClose={() => {
                onClose();
                form.reset();
                setCreateMode(false);
            }}
            title="Add Prompt to Evaluation Set"
            size="lg"
        >
            {isLoadingEvals ? (
                <Stack align="center" py="lg">
                    <Loader size="md" />
                    <Text size="sm" c="dimmed">
                        Loading evaluations...
                    </Text>
                </Stack>
            ) : (
                <form onSubmit={form.onSubmit(handleSubmit)}>
                    <Stack>
                        <Text size="sm" c="dimmed">
                            Add this prompt to an evaluation set to test agent
                            performance.
                        </Text>

                        {!createMode ? (
                            <Select
                                label="Select Evaluation"
                                placeholder="Choose an evaluation set"
                                data={
                                    evaluations?.map((evaluation) => ({
                                        value: evaluation.evalUuid,
                                        label: evaluation.title,
                                    })) || []
                                }
                                {...form.getInputProps('selectedEvalUuid')}
                                searchable
                            />
                        ) : (
                            <TextInput
                                label="Evaluation Name"
                                placeholder="Enter evaluation name"
                                {...form.getInputProps('newEvalName')}
                            />
                        )}

                        <Group justify="space-between" mt="md">
                            {!createMode ? (
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    leftSection={
                                        <MantineIcon icon={IconPlus} />
                                    }
                                    onClick={() => {
                                        setCreateMode(true);
                                        form.setFieldValue(
                                            'selectedEvalUuid',
                                            '',
                                        );
                                    }}
                                >
                                    New Evaluation
                                </Button>
                            ) : (
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    leftSection={
                                        <MantineIcon icon={IconArrowLeft} />
                                    }
                                    onClick={() => {
                                        setCreateMode(false);
                                        form.setFieldValue('newEvalName', '');
                                    }}
                                >
                                    Back
                                </Button>
                            )}

                            <Group>
                                <Button
                                    variant="subtle"
                                    onClick={() => {
                                        onClose();
                                        form.reset();
                                        setCreateMode(false);
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    loading={
                                        createEvaluationMutation.isLoading ||
                                        appendToEvaluationMutation.isLoading
                                    }
                                >
                                    {createMode
                                        ? 'Create & Add'
                                        : 'Add to Eval'}
                                </Button>
                            </Group>
                        </Group>
                    </Stack>
                </form>
            )}
        </MantineModal>
    );
};
