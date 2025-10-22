import { subject } from '@casl/ability';
import {
    type AiArtifact,
    type Dashboard,
    type ToolDashboardArgs,
} from '@lightdash/common';
import {
    Button,
    Group,
    LoadingOverlay,
    Stack,
    TextInput,
    Textarea,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../../../components/common/MantineModal';
import SaveToSpaceForm from '../../../../../components/common/modal/ChartCreateModal/SaveToSpaceForm';
import { useCreateDashboardWithChartsMutation } from '../../../../../hooks/dashboard/useDashboard';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { useSpaceManagement } from '../../../../../hooks/useSpaceManagement';
import { useSpaceSummaries } from '../../../../../hooks/useSpaces';
import useApp from '../../../../../providers/App/useApp';
import {
    getAiAgentDashboardChartVizQueryKey,
    useUpdateArtifactVersion,
} from '../../hooks/useProjectAiAgents';
import {
    convertDashboardVisualizationsToChartData,
    type VizQueryWithOverrides,
} from '../../utils/dashboardChartConverter';

enum ModalStep {
    InitialInfo = 'initialInfo',
    SelectDestination = 'selectDestination',
    Saving = 'saving',
}

interface FormValues {
    dashboardName: string;
    dashboardDescription: string;
    spaceUuid: string | null;
    newSpaceName: string | null;
}

interface Props extends Omit<MantineModalProps, 'children' | 'title'> {
    artifactData: AiArtifact;
    projectUuid: string;
    agentUuid: string;
    dashboardConfig: ToolDashboardArgs;
    onSuccess?: (dashboard: Dashboard) => void;
}

export const AiDashboardSaveModal: FC<Props> = ({
    artifactData,
    projectUuid,
    agentUuid,
    dashboardConfig,
    onSuccess,
    onClose,
    ...modalProps
}) => {
    const { user } = useApp();
    const navigate = useNavigate();
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    const [currentStep, setCurrentStep] = useState<ModalStep>(
        ModalStep.InitialInfo,
    );
    const { mutateAsync: createDashboardWithCharts } =
        useCreateDashboardWithChartsMutation(projectUuid, {
            showToastOnSuccess: false, // We'll handle success toast manually
        });

    const { mutateAsync: updateArtifactVersion } = useUpdateArtifactVersion(
        projectUuid,
        agentUuid,
        artifactData.artifactUuid,
        artifactData.versionUuid,
    );

    const form = useForm<FormValues>({
        initialValues: {
            dashboardName: dashboardConfig.title,
            dashboardDescription: dashboardConfig.description,
            spaceUuid: null,
            newSpaceName: null,
        },
        validate: {
            dashboardName: (value: string) =>
                value.length === 0 ? 'Dashboard name is required' : null,
        },
    });

    const spaceManagement = useSpaceManagement({
        projectUuid,
    });

    const { isCreatingNewSpace, openCreateSpaceForm, setSelectedSpaceUuid } =
        spaceManagement;

    const {
        data: spaces,
        isInitialLoading: isLoadingSpaces,
        isSuccess: isSpacesSuccess,
    } = useSpaceSummaries(projectUuid, true, {
        staleTime: 0,
        select: (data) =>
            data.filter((space) =>
                user.data?.ability.can(
                    'create',
                    subject('Dashboard', {
                        ...space,
                        access: space.userAccess ? [space.userAccess] : [],
                    }),
                ),
            ),
    });

    // Read cached viz-query results from react-query client using exported key
    const getCachedVizQueries = useCallback(() => {
        const results: (VizQueryWithOverrides | undefined)[] = [];
        for (let i = 0; i < dashboardConfig.visualizations.length; i++) {
            const key = getAiAgentDashboardChartVizQueryKey({
                projectUuid,
                agentUuid,
                artifactUuid: artifactData.artifactUuid,
                versionUuid: artifactData.versionUuid,
                chartIndex: i,
            });
            const data = queryClient.getQueryData<VizQueryWithOverrides>(key);
            results.push(data);
        }
        return results;
    }, [
        dashboardConfig.visualizations.length,
        projectUuid,
        agentUuid,
        artifactData.artifactUuid,
        artifactData.versionUuid,
        queryClient,
    ]);

    const { setFieldValue } = form;

    useEffect(() => {
        if (!isSpacesSuccess || !modalProps.opened) {
            return;
        }

        // Set default space
        const defaultSpace = spaces?.find((space) => !space.parentSpaceUuid);
        if (defaultSpace) {
            setFieldValue('spaceUuid', defaultSpace.uuid);
            setSelectedSpaceUuid(defaultSpace.uuid);
        }
    }, [
        isSpacesSuccess,
        modalProps.opened,
        setFieldValue,
        spaces,
        setSelectedSpaceUuid,
    ]);

    const handleClose = useCallback(() => {
        form.reset();
        setCurrentStep(ModalStep.InitialInfo);
        onClose?.();
    }, [form, onClose]);

    const handleNextStep = () => {
        if (form.validate().hasErrors) return;
        setCurrentStep(ModalStep.SelectDestination);
    };

    const handleBack = () => {
        setCurrentStep(ModalStep.InitialInfo);
    };

    const handleSaveDashboard = useCallback(
        async (values: FormValues) => {
            try {
                setCurrentStep(ModalStep.Saving);

                // Handle new space creation
                let targetSpaceUuid = values.spaceUuid;
                if (values.newSpaceName) {
                    const newSpace = await spaceManagement.handleCreateNewSpace(
                        {
                            isPrivate: false,
                        },
                    );
                    targetSpaceUuid = newSpace?.uuid || values.spaceUuid;
                }

                // Get all visualization query results from cache
                const cachedVizQueries = getCachedVizQueries();
                if (cachedVizQueries.some((q) => !q)) {
                    showToastApiError({
                        title: 'Failed to save dashboard',
                        apiError: {
                            name: 'ValidationError',
                            message:
                                "Some visualizations didn't run successfully. ",
                            statusCode: 400,
                            data: {},
                        },
                    });
                    setCurrentStep(ModalStep.SelectDestination);
                    return;
                }

                const vizQueryResults = cachedVizQueries.filter(
                    (c) => c !== undefined,
                );

                // Convert visualizations to chart data
                const chartDataArray =
                    convertDashboardVisualizationsToChartData(
                        dashboardConfig,
                        vizQueryResults,
                        {
                            userId: user.data?.userUuid,
                        },
                    );

                // Map to CreateSavedChart format for the API
                const charts = chartDataArray.map((chartData, index) => ({
                    ...chartData,
                    name: dashboardConfig.visualizations[index].title,
                }));

                // Create dashboard with charts in one API call
                const dashboard = await createDashboardWithCharts({
                    name: values.dashboardName,
                    description: values.dashboardDescription,
                    spaceUuid: targetSpaceUuid!,
                    charts,
                });

                // Update AI artifact with saved dashboard UUID
                await updateArtifactVersion({
                    savedDashboardUuid: dashboard.uuid,
                });

                showToastSuccess({
                    title: 'Dashboard created successfully!',
                    action: {
                        children: 'Open dashboard',
                        onClick: () =>
                            navigate(
                                `/projects/${projectUuid}/dashboards/${dashboard.uuid}`,
                            ),
                    },
                });

                onSuccess?.(dashboard);
                handleClose();
            } catch (error) {
                console.error(error);
                showToastApiError({
                    title: 'Failed to create dashboard',
                    apiError: error as any,
                });
                setCurrentStep(ModalStep.SelectDestination);
            }
        },
        [
            createDashboardWithCharts,
            dashboardConfig,
            user.data?.userUuid,
            spaceManagement,
            navigate,
            projectUuid,
            onSuccess,
            showToastSuccess,
            showToastApiError,
            handleClose,
            getCachedVizQueries,
            updateArtifactVersion,
        ],
    );

    const shouldShowNewSpaceButton = useMemo(
        () =>
            currentStep === ModalStep.SelectDestination && !isCreatingNewSpace,
        [currentStep, isCreatingNewSpace],
    );

    const isFormReadyToSave = useMemo(
        () =>
            currentStep === ModalStep.SelectDestination &&
            form.values.dashboardName &&
            (form.values.newSpaceName || form.values.spaceUuid),
        [
            currentStep,
            form.values.dashboardName,
            form.values.newSpaceName,
            form.values.spaceUuid,
        ],
    );

    const isLoading =
        isLoadingSpaces || spaceManagement.createSpaceMutation.isLoading;

    if (isLoadingSpaces || !spaces) return null;

    const modalActions = (
        <>
            <div>
                {shouldShowNewSpaceButton && (
                    <Button
                        variant="subtle"
                        size="xs"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={openCreateSpaceForm}
                    >
                        New Space
                    </Button>
                )}
            </div>

            <Group>
                {currentStep === ModalStep.SelectDestination && (
                    <Button onClick={handleBack} variant="outline">
                        Back
                    </Button>
                )}
                <Button onClick={handleClose} variant="outline">
                    Cancel
                </Button>
                <Button
                    type="submit"
                    disabled={
                        currentStep === ModalStep.SelectDestination
                            ? !isFormReadyToSave
                            : !form.values.dashboardName
                    }
                    form="dashboard-save-form"
                >
                    {currentStep === ModalStep.InitialInfo ? 'Next' : 'Save'}
                </Button>
            </Group>
        </>
    );

    return (
        <MantineModal
            {...modalProps}
            title="Save Dashboard"
            onClose={handleClose}
            size="lg"
            actions={modalActions}
            modalActionsProps={{ justify: 'space-between' }}
        >
            <LoadingOverlay
                visible={isLoading || currentStep === ModalStep.Saving}
            />

            <form
                id="dashboard-save-form"
                onSubmit={form.onSubmit((values: FormValues) => {
                    if (currentStep === ModalStep.InitialInfo) {
                        handleNextStep();
                    } else if (currentStep === ModalStep.SelectDestination) {
                        void handleSaveDashboard(values);
                    }
                })}
            >
                {currentStep === ModalStep.InitialInfo && (
                    <Stack gap="md">
                        <TextInput
                            label="Dashboard name"
                            placeholder="eg. Sales KPI Dashboard"
                            required
                            {...form.getInputProps('dashboardName')}
                        />
                        <Textarea
                            label="Dashboard description"
                            placeholder="A few words to give your team some context"
                            autosize
                            maxRows={3}
                            {...form.getInputProps('dashboardDescription')}
                        />
                    </Stack>
                )}

                {currentStep === ModalStep.SelectDestination && (
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
