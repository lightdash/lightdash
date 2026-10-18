import {
    type ApiError,
    type SavedChart,
    type UpdateSavedChart,
} from '@lightdash/common';
import { Button, Stack, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconChartBar, IconPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useMemo, type FC } from 'react';
import { z } from 'zod';
import { lightdashApi } from '../../../api';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import SaveToSpaceForm from '../../../components/common/modal/ChartCreateModal/SaveToSpaceForm';
import { saveToSpaceSchema } from '../../../components/common/modal/ChartCreateModal/types';
import useToaster from '../../../hooks/toaster/useToaster';
import { invalidateContent } from '../../../hooks/useContent';
import { useModalSteps } from '../../../hooks/useModalSteps';
import { useSpaceManagement } from '../../../hooks/useSpaceManagement';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import { useAppDispatch } from '../store/hooks';
import { setSavedChartData } from '../store/sqlRunnerSlice';

enum ModalStep {
    InitialInfo = 'initialInfo',
    SelectDestination = 'selectDestination',
}

const updateSqlChartSchema = z
    .object({
        name: z.string().min(1, 'Name is required'),
        description: z.string().nullable(),
    })
    .merge(saveToSpaceSchema);

type FormValues = z.infer<typeof updateSqlChartSchema>;

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    chart: SavedChart;
    onSuccess: () => void;
};

const UPDATE_CHART_FORM_ID = 'update-sql-chart-form';

const updateSavedChart = (uuid: string, data: UpdateSavedChart) =>
    lightdashApi<SavedChart>({
        url: `/saved/${uuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

/** Renames, describes or moves the chart being edited; the chart's version is untouched. */
export const UpdateSqlChartModal: FC<Props> = ({
    projectUuid,
    chart,
    opened,
    onClose,
    onSuccess,
}) => {
    const dispatch = useAppDispatch();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    const { data: spaces = [], isLoading: isSpacesLoading } = useSpaceSummaries(
        projectUuid,
        true,
    );

    const spaceManagement = useSpaceManagement({
        projectUuid,
        defaultSpaceUuid: chart.spaceUuid,
    });

    const { isCreatingNewSpace, openCreateSpaceForm } = spaceManagement;

    const form = useForm<FormValues>({
        initialValues: {
            name: chart.name,
            description: chart.description ?? null,
            spaceUuid: chart.spaceUuid,
            newSpaceName: null,
        },
        validate: zodResolver(updateSqlChartSchema),
    });

    const modalSteps = useModalSteps<ModalStep>(ModalStep.InitialInfo, {
        validators: {
            [ModalStep.InitialInfo]: () => !!form.values.name,
        },
    });

    const { mutateAsync: updateChart, isLoading: isSavingChart } = useMutation<
        SavedChart,
        ApiError,
        UpdateSavedChart
    >((data) => updateSavedChart(chart.uuid, data), {
        mutationKey: ['sqlRunner', 'updateChart', chart.uuid],
        onSuccess: async (updated) => {
            dispatch(setSavedChartData(updated));
            queryClient.setQueryData(
                ['saved_query', updated.slug, projectUuid, false],
                updated,
            );
            await invalidateContent(queryClient, projectUuid);
            await queryClient.invalidateQueries(['spaces']);
            await queryClient.invalidateQueries(['space']);
            await queryClient.invalidateQueries(['pinned_items']);
            await queryClient.invalidateQueries([
                'most-popular-and-recently-updated',
            ]);
            showToastSuccess({ title: 'Success! Chart updated' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update chart',
                apiError: error,
            });
        },
    });

    const handleOnSubmit = form.onSubmit(
        async ({ name, description, spaceUuid, newSpaceName }) => {
            let newSpace = newSpaceName
                ? await spaceManagement.handleCreateNewSpace({
                      inheritParentPermissions: false,
                  })
                : undefined;

            await updateChart({
                name,
                description: description ?? undefined,
                spaceUuid: newSpace?.uuid || spaceUuid || spaces[0]?.uuid,
            });
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
        isSpacesLoading ||
        spaceManagement.createSpaceMutation.isLoading;

    const renderActions = () => {
        if (modalSteps.currentStep === ModalStep.InitialInfo) {
            return (
                <Button onClick={handleNextStep} disabled={!form.values.name}>
                    Next
                </Button>
            );
        }

        return (
            <>
                <Button onClick={handleBack} variant="outline">
                    Back
                </Button>
                <Button
                    type="submit"
                    form={UPDATE_CHART_FORM_ID}
                    disabled={!isFormReadyToSave}
                    loading={isLoading}
                >
                    Save
                </Button>
            </>
        );
    };

    const renderLeftActions = () => {
        if (shouldShowNewSpaceButton) {
            return (
                <Button
                    variant="subtle"
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={openCreateSpaceForm}
                >
                    New Space
                </Button>
            );
        }
        return null;
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Update chart"
            icon={IconChartBar}
            leftActions={renderLeftActions()}
            actions={renderActions()}
        >
            <form id={UPDATE_CHART_FORM_ID} onSubmit={handleOnSubmit}>
                {modalSteps.currentStep === ModalStep.InitialInfo && (
                    <Stack gap="xs">
                        <TextInput
                            label="Chart name"
                            placeholder="eg. How many weekly active users do we have?"
                            required
                            {...form.getInputProps('name')}
                        />
                        <Textarea
                            label="Description"
                            {...form.getInputProps('description')}
                            value={form.values.description ?? ''}
                        />
                    </Stack>
                )}

                {modalSteps.currentStep === ModalStep.SelectDestination && (
                    <SaveToSpaceForm
                        form={form}
                        spaces={spaces}
                        projectUuid={projectUuid}
                        isLoading={isLoading}
                        spaceManagement={spaceManagement}
                        selectedSpaceName={
                            spaces.find(
                                (space) => space.uuid === form.values.spaceUuid,
                            )?.name
                        }
                    />
                )}
            </form>
        </MantineModal>
    );
};
