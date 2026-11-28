import { subject } from '@casl/ability';
import {
    ChartType,
    DashboardTileTypes,
    getDefaultChartTileSize,
    isApiError,
    type ComposerChart,
    type ComposerChartPipeline,
    type ComposerStoredChart,
    type CreateComposerChart,
    type CreateDashboardComposerChartTile,
    type Dashboard,
} from '@lightdash/common';
import {
    Button,
    Group,
    Radio,
    Stack,
    Text,
    TextInput,
    Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconArrowRight, IconChartBar, IconPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import { v4 as uuid4 } from 'uuid';
import { getDestinationDashboardTab } from '../../../components/common/Dashboard/destinationDashboardTab';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import SaveToDashboardForm from '../../../components/common/modal/ChartCreateModal/SaveToDashboardForm';
import SaveToSpaceForm from '../../../components/common/modal/ChartCreateModal/SaveToSpaceForm';
import {
    SaveDestination,
    type SaveToDashboardFormType,
    type SaveToSpaceFormType,
} from '../../../components/common/modal/ChartCreateModal/types';
import {
    appendNewTilesToBottom,
    getDashboard,
    updateDashboardApi,
    useCreateMutation as useCreateDashboardMutation,
    useDashboardQuery,
} from '../../../hooks/dashboard/useDashboard';
import { useDashboards } from '../../../hooks/dashboard/useDashboards';
import useDashboardStorage from '../../../hooks/dashboard/useDashboardStorage';
import { useSavedToDashboardToast } from '../../../hooks/dashboard/useSavedToDashboardToast';
import useToaster from '../../../hooks/toaster/useToaster';
import { useSpaceManagement } from '../../../hooks/useSpaceManagement';
import {
    useCreateMutation as useCreateSpaceMutation,
    useSpaceSummaries,
} from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type FormValues = {
    name: string;
    description: string;
} & SaveToDashboardFormType &
    SaveToSpaceFormType;

export type SavedComposerChartLink = {
    composerChartUuid: string;
    /** Null when a space owns the chart. */
    dashboardUuid: string | null;
};

type ComposerSaveDestination =
    | SaveDestination.Space
    | SaveDestination.Dashboard;

type Props = {
    projectUuid: string;
    onClose: () => void;
    name: string;
    description: string;
    pipeline: ComposerChartPipeline;
    chart: ComposerStoredChart;
    /** Links the answer to the chart; the modal closes once it settles. */
    onSaved: (saved: SavedComposerChartLink) => Promise<void>;
};

/** The chart save modal for a composer chart: a space (the default) or a dashboard, as the classic save. */
export const SaveComposerChartModal: FC<Props> = ({
    projectUuid,
    onClose,
    name,
    description,
    pipeline,
    chart,
    onSaved,
}) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { user } = useApp();
    const navigate = useNavigate();
    const { showToastApiError, showToastError, showToastSuccess } =
        useToaster();
    const showSavedToast = useSavedToDashboardToast();
    const { getDashboardActiveTabUuid } = useDashboardStorage();
    const [destination, setDestination] = useState<ComposerSaveDestination>(
        SaveDestination.Space,
    );
    const [isSelectingDestination, setIsSelectingDestination] = useState(false);
    const spaceManagement = useSpaceManagement({ projectUuid });
    const [isCreatingNewDashboard, setIsCreatingNewDashboard] = useState(false);
    const [isCreatingNewSpace, setIsCreatingNewSpace] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const form = useForm<FormValues>({
        initialValues: {
            name,
            description,
            dashboardUuid: null,
            tabUuid: null,
            newDashboardName: null,
            newDashboardDescription: null,
            spaceUuid: null,
            newSpaceName: null,
        },
    });
    const { data: dashboards, isLoading: isLoadingDashboards } = useDashboards(
        projectUuid,
        { staleTime: 0 },
        true,
    );
    const { data: allSpaces, isLoading: isLoadingSpaces } = useSpaceSummaries(
        projectUuid,
        true,
        { staleTime: 0 },
    );
    const [chartSpaces, dashboardSpaces] = useMemo(() => {
        const canCreateIn =
            (subjectName: 'SavedChart' | 'Dashboard') =>
            (space: NonNullable<typeof allSpaces>[number]) =>
                !!user.data?.ability.can(
                    'create',
                    subject(subjectName, {
                        ...space,
                        access: space.userAccess ? [space.userAccess] : [],
                    }),
                );
        return [
            allSpaces?.filter(canCreateIn('SavedChart')),
            allSpaces?.filter(canCreateIn('Dashboard')),
        ];
    }, [allSpaces, user.data?.ability]);
    const { data: selectedDashboard } = useDashboardQuery({
        uuidOrSlug: form.values.dashboardUuid ?? undefined,
        projectUuid,
    });
    const { mutateAsync: createDashboard } = useCreateDashboardMutation(
        projectUuid,
        false,
        { showToastOnSuccess: false },
    );
    const { mutateAsync: createSpace } = useCreateSpaceMutation(projectUuid);

    const destinationTab = selectedDashboard
        ? getDestinationDashboardTab({
              tabs: selectedDashboard.tabs,
              selectedTabUuid: form.values.tabUuid,
              lastActiveTabUuid: getDashboardActiveTabUuid(
                  selectedDashboard.uuid,
              ),
          })
        : null;
    const cannotUpdateSelected =
        !isCreatingNewDashboard &&
        !!selectedDashboard &&
        !user.data?.ability.can(
            'update',
            subject('Dashboard', selectedDashboard),
        );
    const isReadyToSave =
        destination === SaveDestination.Space
            ? spaceManagement.isCreatingNewSpace
                ? !!spaceManagement.newSpaceName
                : !!spaceManagement.selectedSpaceUuid
            : isCreatingNewDashboard
              ? !!form.values.newDashboardName &&
                (isCreatingNewSpace
                    ? !!form.values.newSpaceName
                    : !!form.values.spaceUuid)
              : !!selectedDashboard && !cannotUpdateSelected;
    const selectedSpaceName = chartSpaces?.find(
        (space) => space.uuid === spaceManagement.selectedSpaceUuid,
    )?.name;

    const goToDestination = () => {
        if (
            destination === SaveDestination.Space &&
            !spaceManagement.selectedSpaceUuid
        ) {
            const firstTopLevel = chartSpaces?.find(
                (space) => !space.parentSpaceUuid,
            );
            if (firstTopLevel) {
                spaceManagement.setSelectedSpaceUuid(firstTopLevel.uuid);
                form.setFieldValue('spaceUuid', firstTopLevel.uuid);
            }
        }
        setIsSelectingDestination(true);
    };

    const createComposerChart = (body: CreateComposerChart) =>
        lightdashApi<ComposerChart>({
            url: `/projects/${projectUuid}/composer-charts`,
            version: 'v2',
            method: 'POST',
            body: JSON.stringify(body),
        });

    // Nested under the selected space and private, as the classic space save.
    const saveToSpace = async (
        values: FormValues,
    ): Promise<SavedComposerChartLink> => {
        const newSpace = spaceManagement.isCreatingNewSpace
            ? await spaceManagement.handleCreateNewSpace({
                  inheritParentPermissions: false,
              })
            : undefined;
        // A retry after a failed chart save lands in the space just made.
        if (newSpace) spaceManagement.setSelectedSpaceUuid(newSpace.uuid);
        const spaceUuid = newSpace?.uuid ?? spaceManagement.selectedSpaceUuid;
        if (!spaceUuid) throw new Error('Pick a space');
        const spaceName = newSpace?.name ?? selectedSpaceName ?? 'the space';
        const composerChart = await createComposerChart({
            spaceUuid,
            name: values.name,
            description: values.description || null,
            pipeline,
            chart,
        });
        showToastSuccess({
            title: `Chart saved to "${spaceName}"`,
            autoClose: 10000,
            action: {
                children: 'Open',
                icon: IconArrowRight,
                onClick: () =>
                    navigate(
                        `/projects/${projectUuid}/composer-charts/${composerChart.uuid}`,
                    ),
            },
        });
        return { composerChartUuid: composerChart.uuid, dashboardUuid: null };
    };

    const getDestination = async (values: FormValues): Promise<Dashboard> => {
        if (!isCreatingNewDashboard) {
            if (!values.dashboardUuid) throw new Error('Pick a dashboard');
            return getDashboard(
                lightdashApi,
                values.dashboardUuid,
                projectUuid,
            );
        }
        const spaceUuid =
            isCreatingNewSpace && values.newSpaceName
                ? (
                      await createSpace({
                          name: values.newSpaceName,
                          inheritParentPermissions: true,
                          access: [],
                      })
                  ).uuid
                : values.spaceUuid;
        if (!spaceUuid || !values.newDashboardName) {
            throw new Error('A name and space are required');
        }
        return createDashboard({
            name: values.newDashboardName,
            description: values.newDashboardDescription ?? '',
            spaceUuid,
            tiles: [],
            tabs: [],
        });
    };

    const saveToDashboard = async (
        values: FormValues,
    ): Promise<SavedComposerChartLink> => {
        const dashboard = await getDestination(values);
        const composerChart = await createComposerChart({
            dashboardUuid: dashboard.uuid,
            name: values.name,
            description: values.description || null,
            pipeline,
            chart,
        });
        const tabUuid = getDestinationDashboardTab({
            tabs: dashboard.tabs,
            selectedTabUuid: values.tabUuid,
            lastActiveTabUuid: getDashboardActiveTabUuid(dashboard.uuid),
        })?.uuid;
        const tileUuid = uuid4();
        const tile: CreateDashboardComposerChartTile = {
            uuid: tileUuid,
            type: DashboardTileTypes.COMPOSER_CHART,
            tabUuid,
            properties: {
                title: values.name,
                hideTitle: chart.chartConfig.type === ChartType.BIG_NUMBER,
                composerChartUuid: composerChart.uuid,
                chartName: values.name,
            },
            ...getDefaultChartTileSize(chart.chartConfig.type),
        };
        const updatedDashboard = await updateDashboardApi(
            lightdashApi,
            dashboard.uuid,
            {
                filters: dashboard.filters,
                tiles: appendNewTilesToBottom<
                    | Dashboard['tiles'][number]
                    | CreateDashboardComposerChartTile
                >(dashboard.tiles, [tile]),
                tabs: dashboard.tabs,
            },
            projectUuid,
        );
        // Reset marks the pre-save copy stale at once; the refetch needn't block closing
        void Promise.all(
            [dashboard.uuid, updatedDashboard.slug].map((key) =>
                queryClient.resetQueries(['saved_dashboard_query', key]),
            ),
        );
        showSavedToast({
            projectUrlIdentifier: projectUuid,
            dashboard: updatedDashboard,
            tileUuid,
            tabUuid: tabUuid ?? null,
        });
        return {
            composerChartUuid: composerChart.uuid,
            dashboardUuid: dashboard.uuid,
        };
    };

    const save = async (values: FormValues) => {
        setIsSaving(true);
        try {
            const saved =
                destination === SaveDestination.Space
                    ? await saveToSpace(values)
                    : await saveToDashboard(values);
            await onSaved(saved).catch(() => undefined);
            onClose();
        } catch (e) {
            if (isApiError(e)) {
                showToastApiError({
                    title: 'Failed to save chart',
                    apiError: e.error,
                });
            } else {
                showToastError({
                    title: 'Failed to save chart',
                    subtitle: e instanceof Error ? e.message : String(e),
                });
            }
        } finally {
            setIsSaving(false);
        }
    };

    const showsNewSpaceButton =
        isSelectingDestination &&
        destination === SaveDestination.Space &&
        !spaceManagement.isCreatingNewSpace;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Save chart"
            icon={IconChartBar}
            size="lg"
            modalRootProps={{ closeOnClickOutside: false }}
            cancelLabel={isSelectingDestination ? false : 'Cancel'}
            leftActions={
                showsNewSpaceButton ? (
                    <Button
                        variant="subtle"
                        size="xs"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={spaceManagement.openCreateSpaceForm}
                    >
                        New Space
                    </Button>
                ) : undefined
            }
            actions={
                isSelectingDestination ? (
                    <Group gap="sm">
                        <Button
                            variant="default"
                            onClick={() => setIsSelectingDestination(false)}
                        >
                            Back
                        </Button>
                        <Button
                            type="submit"
                            form="save-composer-chart"
                            loading={isSaving}
                            disabled={!isReadyToSave}
                        >
                            Save
                        </Button>
                    </Group>
                ) : (
                    <Button
                        disabled={!form.values.name}
                        onClick={goToDestination}
                    >
                        Next
                    </Button>
                )
            }
        >
            <form
                id="save-composer-chart"
                onSubmit={form.onSubmit((values) => void save(values))}
            >
                {isSelectingDestination ? (
                    destination === SaveDestination.Space ? (
                        <SaveToSpaceForm
                            form={form}
                            isLoading={isLoadingSpaces}
                            spaces={chartSpaces}
                            projectUuid={projectUuid}
                            spaceManagement={spaceManagement}
                            selectedSpaceName={selectedSpaceName}
                        />
                    ) : (
                        <Stack gap="xs">
                            <SaveToDashboardForm
                                form={form}
                                isLoading={
                                    isLoadingDashboards || isLoadingSpaces
                                }
                                spaces={dashboardSpaces}
                                dashboards={dashboards}
                                tabs={selectedDashboard?.tabs ?? []}
                                destinationTabUuid={
                                    destinationTab?.uuid ?? null
                                }
                                onSelectTab={(tabUuid) =>
                                    form.setFieldValue('tabUuid', tabUuid)
                                }
                                isCreatingNewDashboard={isCreatingNewDashboard}
                                onStartCreatingNewDashboard={() => {
                                    setIsCreatingNewDashboard(true);
                                    setIsCreatingNewSpace(
                                        !dashboardSpaces?.length,
                                    );
                                    form.setFieldValue(
                                        'spaceUuid',
                                        dashboardSpaces?.[0]?.uuid ?? null,
                                    );
                                }}
                                onCancelCreatingNewDashboard={() => {
                                    setIsCreatingNewDashboard(false);
                                    setIsCreatingNewSpace(false);
                                }}
                                isCreatingNewSpaceForDashboard={
                                    isCreatingNewSpace
                                }
                                onStartCreatingNewSpaceForDashboard={() =>
                                    setIsCreatingNewSpace(true)
                                }
                                onCancelCreatingNewSpaceForDashboard={() =>
                                    setIsCreatingNewSpace(false)
                                }
                            />
                            {cannotUpdateSelected && (
                                <Text fz="xs" c="dimmed">
                                    You do not have permission to edit this
                                    dashboard
                                </Text>
                            )}
                        </Stack>
                    )
                ) : (
                    <Stack gap="xs">
                        <TextInput
                            label="Chart name"
                            required
                            {...form.getInputProps('name')}
                        />
                        <Textarea
                            label="Chart description"
                            placeholder="A few words to give your team some context"
                            autosize
                            maxRows={3}
                            {...form.getInputProps('description')}
                        />
                        <Stack gap="sm" mt="sm">
                            <Text fw={500}>Save to</Text>
                            <Radio.Group
                                value={destination}
                                onChange={(value) =>
                                    setDestination(
                                        value === SaveDestination.Dashboard
                                            ? SaveDestination.Dashboard
                                            : SaveDestination.Space,
                                    )
                                }
                            >
                                <Stack gap="xs">
                                    <Radio
                                        value={SaveDestination.Space}
                                        label="Space"
                                        disabled={
                                            !chartSpaces || isLoadingSpaces
                                        }
                                    />
                                    <Radio
                                        value={SaveDestination.Dashboard}
                                        label="Dashboard"
                                    />
                                </Stack>
                            </Radio.Group>
                        </Stack>
                    </Stack>
                )}
            </form>
        </MantineModal>
    );
};
