import type {
    AiAgentEvaluation,
    ApiCreateEvaluationRequest,
    ApiUpdateEvaluationRequest,
    CreateEvaluationPrompt,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconPlus, IconSettings, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { EvalPromptThreadReference } from './EvalPromptThreadReference';

const evaluationFormSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    prompts: z
        .array(
            z.union([
                z.string().min(1, 'Question cannot be empty'),
                z.object({
                    promptUuid: z.string(),
                    threadUuid: z.string(),
                }),
            ]),
        )
        .min(1, 'At least one question is required'),
});

type EvaluationFormValues = z.infer<typeof evaluationFormSchema>;

type Props = {
    mode: 'create' | 'edit';
    evaluation?: AiAgentEvaluation;
    projectUuid: string;
    agentUuid: string;
    isOpened: boolean;
    onClose: () => void;
    onSubmit: (
        data: ApiCreateEvaluationRequest | ApiUpdateEvaluationRequest,
    ) => void;
    onDelete?: () => void;
    isLoading?: boolean;
    isDeleting?: boolean;
};

export const EvalFormModal: FC<Props> = ({
    mode,
    evaluation,
    projectUuid,
    agentUuid,
    isOpened,
    onClose,
    onSubmit,
    onDelete,
    isLoading = false,
    isDeleting = false,
}) => {
    const initialValues = useMemo(() => {
        if (mode === 'edit' && evaluation) {
            return {
                title: evaluation.title,
                description: evaluation.description || '',
                prompts: evaluation.prompts?.map(
                    (p): CreateEvaluationPrompt => {
                        if (p.type === 'string') {
                            return p.prompt;
                        }
                        return {
                            promptUuid: p.promptUuid,
                            threadUuid: p.threadUuid,
                        };
                    },
                ) || [''],
            };
        }
        return {
            title: '',
            description: '',
            prompts: [''] as CreateEvaluationPrompt[],
        };
    }, [mode, evaluation]);

    const form = useForm<EvaluationFormValues>({
        validate: zodResolver(evaluationFormSchema),
        initialValues,
    });

    const { setValues, clearErrors } = form;

    useEffect(() => {
        if (isOpened) {
            setValues(initialValues);
            clearErrors();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpened, initialValues, setValues, clearErrors]);

    const handleClose = () => {
        form.reset();
        onClose();
    };

    const handleSubmit = (
        values: EvaluationFormValues,
        event?: React.FormEvent,
    ) => {
        event?.preventDefault();
        const filteredPrompts = values.prompts.filter((p) => {
            if (typeof p === 'string') {
                return p.trim().length > 0;
            }
            return p.promptUuid && p.threadUuid;
        });
        const submissionData = {
            title: values.title,
            description: values.description || undefined,
            prompts: filteredPrompts as CreateEvaluationPrompt[],
        };
        onSubmit(submissionData);
    };

    const addPrompt = () => {
        form.insertListItem('prompts', '');
    };

    const removePrompt = (index: number) => {
        if (form.values.prompts.length > 1) {
            form.removeListItem('prompts', index);
        }
    };

    const handleDelete = () => {
        if (!onDelete || !evaluation) return;

        onDelete();
    };

    const modalTitle =
        mode === 'create' ? 'Create Evaluation' : 'Edit Evaluation';
    const submitButtonText =
        mode === 'create' ? 'Create Evaluation' : 'Save Changes';

    const actions = (
        <Group justify="space-between" w="100%">
            {mode === 'edit' && onDelete ? (
                <Button
                    variant="outline"
                    color="red"
                    type="button"
                    leftSection={<MantineIcon icon={IconTrash} />}
                    onClick={handleDelete}
                    disabled={isLoading || isDeleting}
                    loading={isDeleting}
                    form="eval-form"
                >
                    Delete
                </Button>
            ) : (
                <div />
            )}

            <Group gap="sm">
                <Button
                    variant="outline"
                    type="button"
                    onClick={handleClose}
                    disabled={isLoading || isDeleting}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    loading={isLoading}
                    disabled={isDeleting || !form.isValid()}
                    form="eval-form"
                >
                    {submitButtonText}
                </Button>
            </Group>
        </Group>
    );

    return (
        <MantineModal
            opened={isOpened}
            onClose={handleClose}
            icon={IconSettings}
            title={modalTitle}
            size="lg"
            actions={actions}
            modalRootProps={{
                zIndex: 1000,
            }}
        >
            <form id="eval-form" onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="md">
                    <TextInput
                        label="Title"
                        placeholder="Enter evaluation title"
                        required
                        {...form.getInputProps('title')}
                        radius="md"
                    />

                    <Textarea
                        label="Description"
                        placeholder="Enter evaluation description (optional)"
                        rows={3}
                        {...form.getInputProps('description')}
                        radius="md"
                    />

                    <Box>
                        <Group justify="space-between" align="center" mb="sm">
                            <Text size="sm" fw={500}>
                                Questions
                            </Text>
                            <Button
                                variant="subtle"
                                size="xs"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                onClick={addPrompt}
                            >
                                Add Question
                            </Button>
                        </Group>

                        <Stack gap="sm">
                            {form.values.prompts.map((prompt, index) => (
                                <Group key={index} gap="sm" align="flex-start">
                                    <Text
                                        size="sm"
                                        fw={500}
                                        c="dimmed"
                                        miw={20}
                                        mt={8}
                                    >
                                        {index + 1}.
                                    </Text>
                                    <Box flex={1}>
                                        {typeof prompt === 'string' ? (
                                            <Textarea
                                                placeholder="Enter your prompt"
                                                rows={2}
                                                {...form.getInputProps(
                                                    `prompts.${index}`,
                                                )}
                                                radius="md"
                                            />
                                        ) : (
                                            <EvalPromptThreadReference
                                                projectUuid={projectUuid}
                                                agentUuid={agentUuid}
                                                threadUuid={prompt.threadUuid}
                                                promptUuid={prompt.promptUuid}
                                            />
                                        )}
                                    </Box>
                                    <ActionIcon
                                        variant="subtle"
                                        color="red"
                                        disabled={
                                            form.values.prompts.length <= 1
                                        }
                                        onClick={() => removePrompt(index)}
                                        mt={4}
                                    >
                                        <MantineIcon icon={IconTrash} />
                                    </ActionIcon>
                                </Group>
                            ))}
                        </Stack>
                    </Box>
                </Stack>
            </form>
        </MantineModal>
    );
};
