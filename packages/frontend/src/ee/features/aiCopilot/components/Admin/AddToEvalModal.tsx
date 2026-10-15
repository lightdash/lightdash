import {
    type ApiAppendEvaluationRequest,
    type ApiCreateEvaluationRequest,
} from '@lightdash/common';
import { Button, Loader, Select, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('aiCopilotAdmin');
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
                !createMode && !value ? t('addToEval.selectRequired') : null,
            newEvalName: (value: string) =>
                createMode && !value ? t('addToEval.nameRequired') : null,
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

    const handleClose = () => {
        onClose();
        form.reset();
        setCreateMode(false);
    };

    return (
        <MantineModal
            opened={isOpen}
            onClose={handleClose}
            icon={IconPlus}
            title={t('addToEval.title')}
            size="lg"
            leftActions={
                !createMode ? (
                    <Button
                        variant="subtle"
                        size="xs"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={() => {
                            setCreateMode(true);
                            form.setFieldValue('selectedEvalUuid', '');
                        }}
                    >
                        {t('addToEval.newEvaluation')}
                    </Button>
                ) : (
                    <Button
                        variant="subtle"
                        size="xs"
                        leftSection={<MantineIcon icon={IconArrowLeft} />}
                        onClick={() => {
                            setCreateMode(false);
                            form.setFieldValue('newEvalName', '');
                        }}
                    >
                        {t('actions.back', { ns: 'common' })}
                    </Button>
                )
            }
            description={
                createMode
                    ? t('addToEval.createDescription')
                    : t('addToEval.addDescription')
            }
            actions={
                <Button
                    type="submit"
                    form="add-to-eval-form"
                    loading={
                        createEvaluationMutation.isLoading ||
                        appendToEvaluationMutation.isLoading
                    }
                >
                    {createMode
                        ? t('addToEval.createAndAdd')
                        : t('actions.add', { ns: 'common' })}
                </Button>
            }
        >
            {isLoadingEvals ? (
                <Stack align="center" py="lg">
                    <Loader size="md" />
                    <Text size="sm" c="dimmed">
                        {t('addToEval.loading')}
                    </Text>
                </Stack>
            ) : (
                <form
                    id="add-to-eval-form"
                    onSubmit={form.onSubmit(handleSubmit)}
                >
                    <Stack>
                        {!createMode ? (
                            <Select
                                label={t('addToEval.selectLabel')}
                                placeholder={t('addToEval.selectPlaceholder')}
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
                                label={t('addToEval.nameLabel')}
                                placeholder={t('addToEval.namePlaceholder')}
                                {...form.getInputProps('newEvalName')}
                            />
                        )}
                    </Stack>
                </form>
            )}
        </MantineModal>
    );
};
