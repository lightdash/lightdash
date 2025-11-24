import type {
    AiAgentEvaluation,
    ApiCreateEvaluationRequest,
    ApiUpdateEvaluationRequest,
    CreateEvaluationPrompt,
} from '@lightdash/common';
import { isStringPrompt } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
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
                z.object({
                    prompt: z.string().min(1, 'Question cannot be empty'),
                    expectedResponse: z.string().nullable(),
                }),
                z.object({
                    promptUuid: z.string(),
                    threadUuid: z.string(),
                    expectedResponse: z.string().nullable(),
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
                            return {
                                prompt: p.prompt,
                                expectedResponse: p.expectedResponse,
                            };
                        }
                        return {
                            promptUuid: p.promptUuid,
                            threadUuid: p.threadUuid,
                            expectedResponse: p.expectedResponse,
                        };
                    },
                ) || [{ prompt: '', expectedResponse: '' }],
            };
        }
        return {
            title: '',
            description: '',
            prompts: [
                { prompt: '', expectedResponse: '' },
            ] as CreateEvaluationPrompt[],
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
        const filteredPrompts = values.prompts
            .filter((p) => {
                if (isStringPrompt(p)) {
                    return p.prompt.trim().length > 0;
                }
                return p.promptUuid && p.threadUuid;
            })
            .map((p): CreateEvaluationPrompt => {
                if (isStringPrompt(p)) {
                    return {
                        prompt: p.prompt,
                        expectedResponse: p.expectedResponse?.trim() || null,
                    };
                }
                return {
                    promptUuid: p.promptUuid,
                    threadUuid: p.threadUuid,
                    expectedResponse: p.expectedResponse?.trim() || null,
                };
            });
        const submissionData = {
            title: values.title,
            description: values.description || undefined,
            prompts: filteredPrompts,
        };
        onSubmit(submissionData);
    };

    const addPrompt = () => {
        form.insertListItem('prompts', { prompt: '', expectedResponse: '' });
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
            size="full"
            actions={actions}
            modalRootProps={{
                zIndex: 1000,
            }}
            modalContentProps={{
                style: {
                    maxWidth: '100rem',
                },
            }}
        >
            <form id="eval-form" onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="md">
                    <TextInput
                        variant="subtle"
                        label="Title"
                        placeholder="Enter evaluation title"
                        required
                        {...form.getInputProps('title')}
                        radius="md"
                    />

                    <Textarea
                        variant="subtle"
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
                                <>
                                    <Group
                                        key={index}
                                        gap="sm"
                                        align="flex-start"
                                    >
                                        <Text
                                            size="sm"
                                            fw={500}
                                            c="dimmed"
                                            miw={20}
                                        >
                                            {index + 1}.
                                        </Text>
                                        <Stack flex={1}>
                                            <Box flex={1}>
                                                {isStringPrompt(prompt) ? (
                                                    <Textarea
                                                        variant="subtle"
                                                        placeholder="Enter your prompt"
                                                        rows={2}
                                                        {...form.getInputProps(
                                                            `prompts.${index}.prompt`,
                                                        )}
                                                        flex={1}
                                                        resize="vertical"
                                                        label="Prompt"
                                                    />
                                                ) : (
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
                                                    />
                                                )}
                                            </Box>
                                            <Textarea
                                                flex={1}
                                                rows={2}
                                                label="Expected Response"
                                                variant="subtle"
                                                resize="vertical"
                                                {...form.getInputProps(
                                                    `prompts.${index}.expectedResponse`,
                                                )}
                                            />
                                        </Stack>

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
                                    <Divider
                                        variant="dashed"
                                        color="ldGray.3"
                                    />
                                </>
                            ))}
                        </Stack>
                    </Box>
                </Stack>
            </form>
        </MantineModal>
    );
};
