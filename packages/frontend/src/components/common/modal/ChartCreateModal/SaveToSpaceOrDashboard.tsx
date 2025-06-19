import { subject } from '@casl/ability';
import {
    DashboardTileTypes,
    assertUnreachable,
    getDefaultChartTileSize,
    type CreateSavedChartVersion,
    type DashboardChartTile,
    type DashboardVersionedFields,
    type SavedChart,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    LoadingOverlay,
    Radio,
    Stack,
    Text,
    TextInput,
    Textarea,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { v4 as uuid4 } from 'uuid';
import { z } from 'zod';
import {
    appendNewTilesToBottom,
    useDashboardQuery,
    useUpdateDashboard,
} from '../../../../hooks/dashboard/useDashboard';
import { useDashboards } from '../../../../hooks/dashboard/useDashboards';
import { useCreateMutation } from '../../../../hooks/useSavedQuery';
import { useSpaceManagement } from '../../../../hooks/useSpaceManagement';
import { useSpaceSummaries } from '../../../../hooks/useSpaces';
import useApp from '../../../../providers/App/useApp';
import MantineIcon from '../../../common/MantineIcon';
import SaveToDashboardForm from './SaveToDashboardForm';
import SaveToSpaceForm from './SaveToSpaceForm';
import {
    DEFAULT_CHART_METADATA,
    saveToDashboardSchema,
    saveToSpaceSchema,
    type ChartMetadata,
} from './types';

enum SaveDestination {
    Dashboard = 'dashboard',
    Space = 'space',
}

enum ModalStep {
    InitialInfo,
    SelectDestination,
}

const saveToSpaceOrDashboardSchema = z
    .object({
        name: z.string().min(1),
        description: z.string().nullable(),
    })
    // for saving to the dashboard
    .merge(saveToDashboardSchema)
    // for saving to the space
    .merge(saveToSpaceSchema);

type FormValues = z.infer<typeof saveToSpaceOrDashboardSchema>;

type Props = {
    projectUuid?: string;
    savedData: CreateSavedChartVersion;
    onConfirm: (savedData: CreateSavedChartVersion) => void;
    onClose: () => void;
    dashboardInfoFromSavedData?: {
        dashboardUuid: string | null;
        dashboardName: string | null;
    };
    defaultSpaceUuid?: string | undefined;
    chartMetadata?: ChartMetadata;
    redirectOnSuccess?: boolean;
};

export const SaveToSpaceOrDashboard: FC<Props> = ({
    projectUuid,
    savedData,
    defaultSpaceUuid,
    onConfirm,
    onClose,
    dashboardInfoFromSavedData = { dashboardUuid: null, dashboardName: null },
    chartMetadata = DEFAULT_CHART_METADATA,
    redirectOnSuccess = true,
}) => {
    const { user } = useApp();

    const { mutateAsync: createChart, isLoading: isSavingChart } =
        useCreateMutation({ redirectOnSuccess });

    const [saveDestination, setSaveDestination] = useState<SaveDestination>(
        SaveDestination.Space,
    );
    const [currentStep, setCurrentStep] = useState<ModalStep>(
        ModalStep.InitialInfo,
    );

    const spaceManagement = useSpaceManagement({
        projectUuid,
        defaultSpaceUuid,
    });

    const {
        selectedSpaceUuid,
        isCreatingNewSpace,
        openCreateSpaceForm,
        handleCreateNewSpace,
    } = spaceManagement;

    const form = useForm<FormValues>({
        validate: zodResolver(saveToSpaceOrDashboardSchema),
    });

    const {
        data: dashboards,
        isLoading: isLoadingDashboards,
        isSuccess: isDashboardsSuccess,
    } = useDashboards(
        projectUuid,
        {
            staleTime: 0,
        },
        true,
    );

    const {
        data: spaces,
        isLoading: isLoadingSpaces,
        isSuccess: isSpacesSuccess,
    } = useSpaceSummaries(projectUuid, true, {
        select: (data) =>
            data.filter((space) =>
                // Only get spaces that the user can create charts to
                user.data?.ability.can(
                    'create',
                    subject('SavedChart', {
                        ...space,
                        access: space.userAccess ? [space.userAccess] : [],
                    }),
                ),
            ),
        staleTime: 0,
    });

    const { initialize, setFieldValue } = form;

    useEffect(
        function initializeForm() {
            if (!isSpacesSuccess || !isDashboardsSuccess) return;
            if (form.initialized) return;

            const initialValues: FormValues = {
                ...chartMetadata,
                newSpaceName: null,
                dashboardUuid: dashboardInfoFromSavedData.dashboardUuid,
                spaceUuid: null,
            };

            initialize(initialValues);
        },
        [
            form.initialized,
            initialize,
            dashboardInfoFromSavedData.dashboardUuid,
            isDashboardsSuccess,
            isSpacesSuccess,
            chartMetadata,
        ],
    );

    // If default space is set, set the spaceUuid to the default space
    // This happens when the user creates a chart from a space view, so that space is selected by default
    const setPreselectedSpace = useCallback(() => {
        if (form.values.spaceUuid === null) {
            const isValidDefaultSpaceUuid = spaces?.some(
                (space) => space.uuid === defaultSpaceUuid,
            );

            const initialSpaceUuid = isValidDefaultSpaceUuid
                ? defaultSpaceUuid
                : spaces?.find((space) => !space.parentSpaceUuid)?.uuid;

            if (initialSpaceUuid) {
                spaceManagement.setSelectedSpaceUuid(initialSpaceUuid);

                setFieldValue('spaceUuid', initialSpaceUuid);
            }
        }
    }, [
        setFieldValue,
        spaces,
        defaultSpaceUuid,
        spaceManagement,
        form.values.spaceUuid,
    ]);

    const { mutateAsync: updateDashboard } = useUpdateDashboard(
        form.values.dashboardUuid ?? undefined,
    );
    const { data: selectedDashboard } = useDashboardQuery(
        form.values.dashboardUuid ?? undefined,
    );

    const isFormReadyToSave = useMemo(() => {
        if (currentStep === ModalStep.SelectDestination) {
            if (saveDestination === SaveDestination.Space) {
                return (
                    form.values.newSpaceName ||
                    (form.values.spaceUuid !== null &&
                        form.values.spaceUuid !== undefined)
                );
            }
            if (saveDestination === SaveDestination.Dashboard) {
                return form.values.dashboardUuid;
            }
        }
        return false;
    }, [currentStep, form.values, saveDestination]);

    const handleOnSubmit = useCallback(
        async (values: FormValues) => {
            if (!isFormReadyToSave) {
                return;
            }

            let savedQuery: SavedChart | undefined;
            /**
             * Create chart
             * Save to dashboard by creating a new tile and then updating the dashboard by sending it to the bottom
             */
            if (saveDestination === SaveDestination.Dashboard) {
                if (!selectedDashboard) {
                    throw new Error('Expected dashboard');
                }
                savedQuery = await createChart({
                    ...savedData,
                    name: values.name,
                    description: values.description ?? undefined,
                    dashboardUuid: values.dashboardUuid,
                });
                const firstTab = selectedDashboard.tabs?.[0];
                const newTile: DashboardChartTile = {
                    uuid: uuid4(),
                    type: DashboardTileTypes.SAVED_CHART,
                    tabUuid: firstTab?.uuid,
                    properties: {
                        belongsToDashboard: true,
                        savedChartUuid: savedQuery.uuid,
                        chartName: values.name,
                    },
                    ...getDefaultChartTileSize(savedData.chartConfig?.type),
                };
                const updateFields: DashboardVersionedFields = {
                    filters: selectedDashboard.filters,
                    tiles: appendNewTilesToBottom(selectedDashboard.tiles, [
                        newTile,
                    ]),
                    tabs: selectedDashboard.tabs,
                };
                await updateDashboard(updateFields);
            }

            /**
             * Create space if user wants to create a new space
             * Save to space by creating a new chart
             */
            if (saveDestination === SaveDestination.Space) {
                let newSpace = values.newSpaceName
                    ? await handleCreateNewSpace({
                          isPrivate: true,
                      })
                    : undefined;

                const spaceUuid =
                    newSpace?.uuid ?? values.spaceUuid ?? undefined;

                savedQuery = await createChart({
                    ...savedData,
                    name: values.name,
                    description: values.description ?? undefined,
                    spaceUuid,
                    dashboardUuid: undefined,
                });
            }

            if (savedQuery) {
                onConfirm(savedQuery);
                return savedQuery;
            }
        },
        [
            isFormReadyToSave,
            saveDestination,
            selectedDashboard,
            createChart,
            savedData,
            updateDashboard,
            handleCreateNewSpace,
            onConfirm,
        ],
    );

    const isLoading =
        !form.initialized ||
        isLoadingDashboards ||
        isLoadingSpaces ||
        isSavingChart ||
        spaceManagement.createSpaceMutation.isLoading;

    const handleBack = () => {
        setCurrentStep(ModalStep.InitialInfo);
    };

    const handleNextStep = () => {
        setCurrentStep(ModalStep.SelectDestination);
        if (saveDestination === SaveDestination.Space) {
            setPreselectedSpace();
        }
    };

    // Determine if we should show the "New Space" button
    const shouldShowNewSpaceButton =
        currentStep === ModalStep.SelectDestination &&
        saveDestination === SaveDestination.Space &&
        !isCreatingNewSpace;

    // Get the name of the selected space for display in SpaceCreationForm
    const selectedSpaceName = useMemo(() => {
        if (!selectedSpaceUuid) return undefined;
        return spaces?.find((space) => space.uuid === selectedSpaceUuid)?.name;
    }, [selectedSpaceUuid, spaces]);

    return (
        <form
            onSubmit={(e) => {
                if (currentStep === ModalStep.InitialInfo) {
                    e.preventDefault();
                    return;
                }
                form.onSubmit((values) => handleOnSubmit(values))(e);
            }}
        >
            <LoadingOverlay visible={isLoading} />

            <Box p="md">
                {currentStep === ModalStep.InitialInfo && (
                    <Stack spacing="xs">
                        <TextInput
                            label="Chart name"
                            placeholder="eg. How many weekly active users do we have?"
                            required
                            {...form.getInputProps('name')}
                            value={form.values.name ?? ''}
                            data-testid="ChartCreateModal/NameInput"
                        />
                        <Textarea
                            label="Chart description"
                            placeholder="A few words to give your team some context"
                            autosize
                            maxRows={3}
                            {...form.getInputProps('description')}
                            value={form.values.description ?? ''}
                        />

                        <Stack spacing="sm" mt="sm">
                            <Text fw={500}>Save to</Text>

                            <Radio.Group
                                value={saveDestination}
                                onChange={(value: SaveDestination) =>
                                    setSaveDestination(value)
                                }
                            >
                                <Stack spacing="xs">
                                    <Radio
                                        value={SaveDestination.Space}
                                        label="Space"
                                        styles={(theme) => ({
                                            label: {
                                                paddingLeft: theme.spacing.xs,
                                            },
                                        })}
                                        disabled={!spaces || isLoadingSpaces}
                                    />
                                    <Radio
                                        value={SaveDestination.Dashboard}
                                        label="Dashboard"
                                        styles={(theme) => ({
                                            label: {
                                                paddingLeft: theme.spacing.xs,
                                            },
                                        })}
                                    />
                                </Stack>
                            </Radio.Group>
                        </Stack>
                    </Stack>
                )}

                {currentStep === ModalStep.SelectDestination && (
                    <>
                        {saveDestination === SaveDestination.Space ? (
                            <SaveToSpaceForm
                                form={form}
                                isLoading={isLoadingSpaces}
                                spaces={spaces}
                                projectUuid={projectUuid}
                                spaceManagement={spaceManagement}
                                selectedSpaceName={selectedSpaceName}
                            />
                        ) : saveDestination === SaveDestination.Dashboard ? (
                            <SaveToDashboardForm
                                form={form}
                                isLoading={
                                    isLoadingDashboards || isLoadingSpaces
                                }
                                spaces={spaces}
                                dashboards={dashboards}
                            />
                        ) : (
                            assertUnreachable(
                                saveDestination,
                                `Unknown save destination ${saveDestination}`,
                            )
                        )}
                    </>
                )}
            </Box>
            <Group
                position="right"
                w="100%"
                sx={(theme) => ({
                    borderTop: `1px solid ${theme.colors.gray[4]}`,
                    bottom: 0,
                    padding: theme.spacing.md,
                })}
            >
                {currentStep === ModalStep.InitialInfo ? (
                    <>
                        <Button onClick={onClose} variant="outline">
                            Cancel
                        </Button>
                        <Button
                            onClick={(
                                e: React.MouseEvent<HTMLButtonElement>,
                            ) => {
                                e.preventDefault();
                                handleNextStep();
                            }}
                            disabled={!form.values.name}
                            type="button"
                        >
                            Next
                        </Button>
                    </>
                ) : (
                    <>
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

                        <Button onClick={handleBack} variant="outline">
                            Back
                        </Button>
                        <Button
                            type="submit"
                            loading={
                                isSavingChart ||
                                spaceManagement.createSpaceMutation.isLoading
                            }
                            disabled={!isFormReadyToSave}
                        >
                            Save
                        </Button>
                    </>
                )}
            </Group>
        </form>
    );
};
