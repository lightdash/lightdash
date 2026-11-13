import { subject } from '@casl/ability';
import {
    ChartType,
    DashboardTileTypes,
    getDefaultChartTileSize,
    type ApiError,
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
import { IconChartBar } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { v4 as uuid4 } from 'uuid';
import { getDestinationDashboardTab } from '../../../components/common/Dashboard/destinationDashboardTab';
import MantineModal from '../../../components/common/MantineModal';
import SaveToDashboardForm from '../../../components/common/modal/ChartCreateModal/SaveToDashboardForm';
import {
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
import useToaster from '../../../hooks/toaster/useToaster';
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

export type SavedComposerChart = {
    composerChartUuid: string;
    dashboardUuid: string;
};

type Props = {
    projectUuid: string;
    opened: boolean;
    onClose: () => void;
    name: string;
    description: string;
    pipeline: ComposerChartPipeline;
    chart: ComposerStoredChart;
    onSaved: (saved: SavedComposerChart) => void;
};

/** The chart save modal for a composer chart: dashboards only, the space option shown greyed out. */
export const SaveComposerChartModal: FC<Props> = ({
    projectUuid,
    opened,
    onClose,
    name,
    description,
    pipeline,
    chart,
    onSaved,
}) => {
    const lightdashApi = useLightdashApi();
    const { user } = useApp();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { getDashboardActiveTabUuid } = useDashboardStorage();
    const [isSelectingDashboard, setIsSelectingDashboard] = useState(false);
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
    const { data: spaces, isLoading: isLoadingSpaces } = useSpaceSummaries(
        projectUuid,
        true,
        {
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
        },
    );
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
    const isReadyToSave = isCreatingNewDashboard
        ? !!form.values.newDashboardName &&
          (isCreatingNewSpace
              ? !!form.values.newSpaceName
              : !!form.values.spaceUuid)
        : !!selectedDashboard;

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

    const save = async (values: FormValues) => {
        setIsSaving(true);
        try {
            const dashboard = await getDestination(values);
            const body: CreateComposerChart = {
                dashboardUuid: dashboard.uuid,
                name: values.name,
                description: values.description || null,
                pipeline,
                chart,
            };
            const composerChart = await lightdashApi<ComposerChart>({
                url: `/projects/${projectUuid}/composer-charts`,
                version: 'v2',
                method: 'POST',
                body: JSON.stringify(body),
            });
            const tabUuid = getDestinationDashboardTab({
                tabs: dashboard.tabs,
                selectedTabUuid: values.tabUuid,
                lastActiveTabUuid: getDashboardActiveTabUuid(dashboard.uuid),
            })?.uuid;
            const tile: CreateDashboardComposerChartTile = {
                uuid: uuid4(),
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
            await updateDashboardApi(
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
            showToastSuccess({ title: `Saved to "${dashboard.name}"` });
            onSaved({
                composerChartUuid: composerChart.uuid,
                dashboardUuid: dashboard.uuid,
            });
            onClose();
        } catch (e) {
            showToastApiError({
                title: 'Failed to save chart',
                apiError: (e as ApiError).error,
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Save chart"
            icon={IconChartBar}
            size="lg"
            modalRootProps={{ closeOnClickOutside: false }}
            actions={
                isSelectingDashboard ? (
                    <Group gap="sm">
                        <Button
                            variant="default"
                            onClick={() => setIsSelectingDashboard(false)}
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
                        onClick={() => setIsSelectingDashboard(true)}
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
                {isSelectingDashboard ? (
                    <SaveToDashboardForm
                        form={form}
                        isLoading={isLoadingDashboards || isLoadingSpaces}
                        spaces={spaces}
                        dashboards={dashboards}
                        tabs={selectedDashboard?.tabs ?? []}
                        destinationTabUuid={destinationTab?.uuid ?? null}
                        onSelectTab={(tabUuid) =>
                            form.setFieldValue('tabUuid', tabUuid)
                        }
                        isCreatingNewDashboard={isCreatingNewDashboard}
                        onStartCreatingNewDashboard={() => {
                            setIsCreatingNewDashboard(true);
                            setIsCreatingNewSpace(!spaces?.length);
                            form.setFieldValue(
                                'spaceUuid',
                                spaces?.[0]?.uuid ?? null,
                            );
                        }}
                        onCancelCreatingNewDashboard={() => {
                            setIsCreatingNewDashboard(false);
                            setIsCreatingNewSpace(false);
                        }}
                        isCreatingNewSpaceForDashboard={isCreatingNewSpace}
                        onStartCreatingNewSpaceForDashboard={() =>
                            setIsCreatingNewSpace(true)
                        }
                        onCancelCreatingNewSpaceForDashboard={() =>
                            setIsCreatingNewSpace(false)
                        }
                    />
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
                            <Radio.Group value="dashboard">
                                <Stack gap="xs">
                                    <Radio
                                        value="space"
                                        label="Space"
                                        description="This chart can only be saved to a dashboard"
                                        disabled
                                    />
                                    <Radio
                                        value="dashboard"
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
