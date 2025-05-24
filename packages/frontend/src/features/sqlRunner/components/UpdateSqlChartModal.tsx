import type { Space, SpaceSummary, SqlChart } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    TextInput,
    Textarea,
    type ModalProps,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconChartBar, IconPlus } from '@tabler/icons-react';
import { useEffect, useMemo } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../components/common/MantineIcon';
import SaveToSpaceForm from '../../../components/common/modal/ChartCreateModal/SaveToSpaceForm';
import { saveToSpaceSchema } from '../../../components/common/modal/ChartCreateModal/types';
import { useModalSteps } from '../../../hooks/useModalSteps';
import { useSpaceManagement } from '../../../hooks/useSpaceManagement';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import {
    useSavedSqlChart,
    useUpdateSqlChartMutation,
} from '../hooks/useSavedSqlCharts';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSavedChartData } from '../store/sqlRunnerSlice';

enum ModalStep {
    InitialInfo = 'initialInfo',
    SelectDestination = 'selectDestination',
}

const updateSqlChartSchema = z
    .object({
        name: z.string().min(1),
        description: z.string().nullable(),
    })
    .merge(saveToSpaceSchema);

type FormValues = z.infer<typeof updateSqlChartSchema>;

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    savedSqlUuid: string;
    slug: string;
    onSuccess: () => void;
};

export const UpdateSqlChartModal = ({
    projectUuid,
    savedSqlUuid,
    slug,
    opened,
    onClose,
    onSuccess,
}: Props) => {
    const dispatch = useAppDispatch();
    const savedSqlChart = useAppSelector(
        (state) => state.sqlRunner.savedSqlChart,
    );
    const {
        data,
        isLoading: isChartLoading,
        isSuccess: isChartSuccess,
    } = useSavedSqlChart({
        projectUuid,
        uuid: savedSqlUuid,
    });

    const { data: spaces = [], isLoading: isSpacesLoading } = useSpaceSummaries(
        projectUuid,
        true,
    );

    const spaceManagement = useSpaceManagement({
        projectUuid,
        defaultSpaceUuid: data?.space.uuid,
    });

    const { isCreatingNewSpace, openCreateSpaceForm } = spaceManagement;

    const form = useForm<FormValues>({
        initialValues: {
            name: '',
            description: null,
            spaceUuid: null,
            newSpaceName: null,
        },
        validate: zodResolver(updateSqlChartSchema),
    });

    const modalSteps = useModalSteps<ModalStep>(ModalStep.InitialInfo, {
        validators: {
            [ModalStep.InitialInfo]: () => !!form.values.name,
        },
    });

    const { mutateAsync: updateChart, isLoading: isSavingChart } =
        useUpdateSqlChartMutation(projectUuid, savedSqlUuid, slug);

    useEffect(() => {
        if (isChartSuccess && data) {
            const values = {
                name: data.name,
                description: data.description,
                spaceUuid: data.space.uuid,
                newSpaceName: null,
            };

            form.setValues(values);
            form.resetDirty(values);
        }
        // form can't be a dependency because it will cause infinite loop
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, isChartSuccess]);

    const handleOnSubmit = form.onSubmit(
        async ({ name, description, spaceUuid, newSpaceName }) => {
            let newSpace = newSpaceName
                ? await spaceManagement.handleCreateNewSpace({
                      isPrivate: true,
                  })
                : undefined;

            await updateChart({
                unversionedData: {
                    name,
                    description: description ?? null,
                    spaceUuid: newSpace?.uuid || spaceUuid || spaces[0]?.uuid,
                },
            });
            const newSavedSqlChart = { ...savedSqlChart };
            newSavedSqlChart.name = name;
            newSavedSqlChart.description = description;
            if (newSpace?.uuid || spaceUuid !== savedSqlChart?.space.uuid) {
                // only when space is updated
                let updatedSpace: Space | SpaceSummary;
                if (newSpace?.uuid) {
                    updatedSpace = newSpace;
                } else {
                    updatedSpace = spaces.find(
                        (space) => space.uuid === spaceUuid,
                    )!;
                }
                newSavedSqlChart.space = {
                    name: updatedSpace.name,
                    isPrivate: updatedSpace.isPrivate,
                    userAccess:
                        'userAccess' in updatedSpace
                            ? updatedSpace.userAccess
                            : savedSqlChart?.space.userAccess, // keep the userAccess same as before if newSpace is created
                    uuid: updatedSpace.uuid,
                };
            }
            dispatch(setSavedChartData(newSavedSqlChart as SqlChart));
            modalSteps.goToStep(ModalStep.InitialInfo);
            onSuccess();
        },
    );

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
            (form.values.newSpaceName || form.values.spaceUuid),
        [
            modalSteps.currentStep,
            form.values.name,
            form.values.newSpaceName,
            form.values.spaceUuid,
        ],
    );

    const isLoading =
        isSavingChart ||
        isChartLoading ||
        isSpacesLoading ||
        spaceManagement.createSpaceMutation.isLoading;

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconChartBar} size="lg" color="gray.7" />
                    <Text fw={500}>Update chart</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <form onSubmit={handleOnSubmit}>
                {modalSteps.currentStep === ModalStep.InitialInfo && (
                    <Stack p="md">
                        <Stack spacing="xs">
                            <TextInput
                                label="Chart name"
                                placeholder="eg. How many weekly active users do we have?"
                                required
                                {...form.getInputProps('name')}
                            />
                            <Textarea
                                label="Description"
                                {...form.getInputProps('description')}
                            />
                        </Stack>
                    </Stack>
                )}

                {modalSteps.currentStep === ModalStep.SelectDestination && (
                    <Stack p="md">
                        <SaveToSpaceForm
                            form={form}
                            spaces={spaces}
                            projectUuid={projectUuid}
                            isLoading={isLoading}
                            spaceManagement={spaceManagement}
                            selectedSpaceName={
                                spaces.find(
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
                                loading={isLoading}
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
