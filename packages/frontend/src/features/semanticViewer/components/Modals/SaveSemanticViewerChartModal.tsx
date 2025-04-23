import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconChartBar, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../../components/common/MantineIcon';
import SaveToSpaceForm from '../../../../components/common/modal/ChartCreateModal/SaveToSpaceForm';
import { saveToSpaceSchema } from '../../../../components/common/modal/ChartCreateModal/types';
import { selectCompleteConfigByKind } from '../../../../components/DataViz/store/selectors';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useModalSteps } from '../../../../hooks/useModalSteps';
import { useSpaceManagement } from '../../../../hooks/useSpaceManagement';
import { useSpaceSummaries } from '../../../../hooks/useSpaces';
import { useAppDispatch, useAppSelector } from '../../../sqlRunner/store/hooks';
import { useCreateSemanticViewerChartMutation } from '../../api/hooks';
import {
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../../store/selectors';
import {
    updateName,
    updateSaveModalOpen,
} from '../../store/semanticViewerSlice';

enum ModalStep {
    InitialInfo = 'initialInfo',
    SelectDestination = 'selectDestination',
}

const saveSemanticViewerChartSchema = z
    .object({
        name: z.string().min(1),
        description: z.string().nullable(),
    })
    .merge(saveToSpaceSchema);

type FormValues = z.infer<typeof saveSemanticViewerChartSchema>;

type Props = {
    onSave: (slug: string) => void;
};

const SaveSemanticViewerChartModal: FC<Props> = ({ onSave }) => {
    const dispatch = useAppDispatch();
    const [opened, { close }] = useDisclosure(true);
    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const name = useAppSelector((state) => state.semanticViewer.name);
    const semanticLayerView = useAppSelector(
        (state) => state.semanticViewer.semanticLayerView,
    );
    const semanticLayerQuery = useAppSelector(selectSemanticLayerQuery);

    const activeChartKind = useAppSelector(
        (state) => state.semanticViewer.activeChartKind,
    );
    const selectedChartConfig = useAppSelector((state) =>
        selectCompleteConfigByKind(state, activeChartKind),
    );

    const form = useForm<FormValues>({
        validate: zodResolver(saveToSpaceSchema),
    });

    const modalSteps = useModalSteps<ModalStep>(ModalStep.InitialInfo, {
        validators: {
            [ModalStep.InitialInfo]: () => !!form.values.name,
        },
    });

    const spacesQuery = useSpaceSummaries(projectUuid, true);

    const spaceManagement = useSpaceManagement({
        projectUuid,
    });

    const { handleCreateNewSpace, isCreatingNewSpace, openCreateSpaceForm } =
        spaceManagement;

    const handleClose = useCallback(() => {
        close();

        setTimeout(() => {
            dispatch(updateSaveModalOpen(false));
        }, 300);
    }, [close, dispatch]);

    useEffect(() => {
        if (spacesQuery.isSuccess && !form.initialized) {
            form.initialize({
                name,
                description: null,
                newSpaceName: null,
                spaceUuid: spacesQuery.data[0]?.uuid ?? null,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spacesQuery]);

    const {
        mutateAsync: saveChart,
        isLoading: isSaving,
        isSuccess: isSaved,
        isError: isSavingError,
        error: saveError,
    } = useCreateSemanticViewerChartMutation(projectUuid, {});

    useEffect(() => {
        if (isSaved) {
            handleClose();
        }
    }, [isSaved, handleClose]);

    const { showToastApiError, showToastSuccess } = useToaster();

    useEffect(() => {
        if (isSavingError) {
            showToastApiError({
                title: `Failed to create chart`,
                apiError: saveError.error,
            });
        }
    }, [isSavingError, saveError, showToastApiError]);

    useEffect(() => {
        if (isSaved) {
            showToastSuccess({
                title: 'Chart saved successfully',
            });
        }
    }, [isSaved, showToastSuccess]);

    const hasConfigAndQuery = !!selectedChartConfig && !!semanticLayerQuery;

    const handleOnSubmit = useCallback(async () => {
        if (!spacesQuery.isSuccess) return;
        if (!hasConfigAndQuery) return;

        let newSpace = form.values.newSpaceName
            ? await handleCreateNewSpace({
                  isPrivate: true,
              })
            : undefined;

        const spaceUuid =
            newSpace?.uuid ||
            form.values.spaceUuid ||
            spacesQuery.data[0]?.uuid;

        const newChart = await saveChart({
            name: form.values.name,
            description: form.values.description || '',
            semanticLayerView: semanticLayerView ?? null,
            semanticLayerQuery,
            config: selectedChartConfig,
            spaceUuid: spaceUuid,
        });

        dispatch(updateName(form.values.name));

        handleClose();
        onSave(newChart.slug);
    }, [
        spacesQuery.isSuccess,
        spacesQuery.data,
        hasConfigAndQuery,
        form.values.newSpaceName,
        form.values.spaceUuid,
        form.values.name,
        form.values.description,
        handleCreateNewSpace,
        saveChart,
        semanticLayerView,
        semanticLayerQuery,
        selectedChartConfig,
        dispatch,
        handleClose,
        onSave,
    ]);

    const handleNextStep = () => {
        modalSteps.goToStep(ModalStep.SelectDestination);
    };

    const handleBack = () => {
        modalSteps.goToStep(ModalStep.InitialInfo);
    };

    const shouldShowNewSpaceButton = useMemo(
        () =>
            modalSteps.currentStep === ModalStep.SelectDestination &&
            !isCreatingNewSpace,
        [modalSteps.currentStep, isCreatingNewSpace],
    );

    const isFormReadyToSave = useMemo(
        () =>
            modalSteps.currentStep === ModalStep.SelectDestination &&
            form.values.name &&
            (form.values.newSpaceName || form.values.spaceUuid) &&
            hasConfigAndQuery,
        [
            modalSteps.currentStep,
            form.values.name,
            form.values.newSpaceName,
            form.values.spaceUuid,
            hasConfigAndQuery,
        ],
    );

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconChartBar} size="lg" color="gray.7" />
                    <Text fw={500}>Save chart</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <form onSubmit={form.onSubmit(handleOnSubmit)}>
                {modalSteps.currentStep === ModalStep.InitialInfo && (
                    <Stack p="md">
                        <Stack spacing="xs">
                            <TextInput
                                label="Chart name"
                                placeholder="eg. How many weekly active users do we have?"
                                required
                                {...form.getInputProps('name')}
                                value={form.values.name ?? ''}
                            />
                            <Textarea
                                label="Description"
                                {...form.getInputProps('description')}
                                value={form.values.description ?? ''}
                            />
                        </Stack>
                    </Stack>
                )}

                {modalSteps.currentStep === ModalStep.SelectDestination && (
                    <Stack p="md">
                        <SaveToSpaceForm
                            form={form}
                            isLoading={isSaving || spacesQuery.isLoading}
                            spaces={spacesQuery.data}
                            projectUuid={projectUuid}
                            spaceManagement={spaceManagement}
                            selectedSpaceName={
                                spacesQuery.data?.find(
                                    (space) =>
                                        space.uuid === form.values.spaceUuid,
                                )?.name
                            }
                        />
                    </Stack>
                )}

                <Group
                    position="right"
                    w="100%"
                    sx={(theme) => ({
                        borderTop: `1px solid ${theme.colors.gray[4]}`,
                        bottom: 0,
                        padding: theme.spacing.md,
                    })}
                >
                    {shouldShowNewSpaceButton && (
                        <Button
                            variant="subtle"
                            size="xs"
                            leftIcon={<MantineIcon icon={IconPlus} />}
                            onClick={openCreateSpaceForm}
                            mr="auto"
                        >
                            New Space
                        </Button>
                    )}

                    <Button
                        onClick={handleClose}
                        variant="outline"
                        disabled={isSaving}
                    >
                        Cancel
                    </Button>

                    {modalSteps.currentStep === ModalStep.InitialInfo ? (
                        <Button
                            onClick={handleNextStep}
                            disabled={!form.values.name}
                        >
                            Next
                        </Button>
                    ) : (
                        <>
                            <Button onClick={handleBack} variant="outline">
                                Back
                            </Button>
                            <Button
                                type="submit"
                                disabled={!isFormReadyToSave}
                                loading={isSaving}
                            >
                                Save
                            </Button>
                        </>
                    )}
                </Group>
            </form>
        </Modal>
    );
};

export default SaveSemanticViewerChartModal;
