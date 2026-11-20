import {
    assertUnreachable,
    DashboardTileTypes,
    getDefaultChartTileSize,
    type DashboardTile,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Group,
    Select,
    Stack,
    Textarea,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconArrowLeft,
    IconLayoutDashboard,
    IconPlus,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import { v4 as uuid4 } from 'uuid';
import { useSavedSqlChart } from '../../features/sqlRunner/hooks/useSavedSqlCharts';
import {
    appendNewTilesToBottom,
    useCreateMutation,
    useDashboardQuery,
    useUpdateDashboard,
} from '../../hooks/dashboard/useDashboard';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { getTileLinkPath } from '../../hooks/dashboard/useTileLink';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaceSummaries,
} from '../../hooks/useSpaces';
import DashboardTabSelect from '../common/Dashboard/DashboardTabSelect';
import { getDestinationDashboardTab } from '../common/Dashboard/destinationDashboardTab';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import classes from './AddTilesToDashboardModal.module.css';

interface AddTilesToDashboardModalProps {
    isOpen: boolean;
    projectUuid: string;
    uuid: string;
    dashboardTileType: DashboardTileTypes;
    onClose?: () => void;
}

const AddTilesToDashboardModal: FC<AddTilesToDashboardModalProps> = ({
    isOpen,
    projectUuid,
    uuid,
    dashboardTileType,
    onClose,
}) => {
    const [isCreatingNewDashboard, setIsCreatingNewDashboard] = useState(false);
    const [isCreatingNewSpace, setIsCreatingNewSpace] =
        useState<boolean>(false);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedTabUuid, setSelectedTabUuid] = useState<string | null>(null);
    const navigate = useNavigate();
    const { getDashboardActiveTabUuid } = useDashboardStorage();

    const exploreChartQuery = useSavedQuery({
        uuidOrSlug: uuid,
        projectUuid,
        useQueryOptions: {
            enabled: dashboardTileType === DashboardTileTypes.SAVED_CHART,
        },
    });
    const sqlChartQuery = useSavedSqlChart(
        { projectUuid, uuid: uuid },
        { enabled: dashboardTileType === DashboardTileTypes.SQL_CHART },
    );

    const tile = useMemo<
        | {
              props: { uuid: string; spaceUuid: string };
              payload: DashboardTile;
          }
        | undefined
    >(() => {
        switch (dashboardTileType) {
            case DashboardTileTypes.SAVED_CHART:
                if (!exploreChartQuery.isSuccess) return;

                return {
                    props: {
                        uuid: exploreChartQuery.data.uuid,
                        spaceUuid: exploreChartQuery.data.spaceUuid,
                    },
                    payload: {
                        uuid: uuid4(),
                        type: DashboardTileTypes.SAVED_CHART,
                        properties: {
                            savedChartUuid: exploreChartQuery.data.uuid,
                        },
                        tabUuid: undefined,
                        ...getDefaultChartTileSize(
                            exploreChartQuery.data.chartConfig?.type,
                        ),
                    },
                };

            case DashboardTileTypes.SQL_CHART:
                if (!sqlChartQuery.isSuccess) return;

                return {
                    props: {
                        uuid: sqlChartQuery.data.savedSqlUuid,
                        spaceUuid: sqlChartQuery.data.space.uuid,
                    },
                    payload: {
                        uuid: uuid4(),
                        type: DashboardTileTypes.SQL_CHART,
                        properties: {
                            savedSqlUuid: sqlChartQuery.data.savedSqlUuid,
                            chartName: sqlChartQuery.data.name,
                        },
                        tabUuid: undefined,
                        ...getDefaultChartTileSize(
                            sqlChartQuery.data.config?.type,
                        ),
                    },
                };

            case DashboardTileTypes.LOOM:
            case DashboardTileTypes.MARKDOWN:
            case DashboardTileTypes.HEADING:
            case DashboardTileTypes.DATA_APP:
            case DashboardTileTypes.COMPOSER_CHART:
                throw new Error(
                    `not implemented for chart tile type: ${dashboardTileType}`,
                );
            default:
                return assertUnreachable(
                    dashboardTileType,
                    `Unsupported chart tile type: ${dashboardTileType}`,
                );
        }
    }, [dashboardTileType, exploreChartQuery, sqlChartQuery]);

    const { data: dashboards, isInitialLoading: isLoadingDashboards } =
        useDashboards(
            projectUuid,
            {
                staleTime: 0,
                onSuccess: (data) => {
                    if (data.length === 0) {
                        setIsCreatingNewDashboard(true);
                    }
                },
            },
            true, // includePrivateSpaces
        );

    const { data: spaces, isInitialLoading: isLoadingSpaces } =
        useSpaceSummaries(projectUuid, true, {
            staleTime: 0,
            enabled: isOpen, // Only fetch when modal is open
            onSuccess: (data) => {
                if (data.length === 0) {
                    setIsCreatingNewSpace(true);
                }
            },
        });

    const currentSpace = spaces?.find((s) => s.uuid === tile?.props.spaceUuid);

    const dashboardSelectItems = useMemo(() => {
        if (!dashboards || !spaces) return [];

        // Group dashboards by space
        const groupedBySpace = dashboards.reduce<
            Record<
                string,
                { value: string; label: string; spaceUuid: string }[]
            >
        >((acc, d) => {
            const spaceName =
                spaces.find((s) => s.uuid === d.spaceUuid)?.name ?? 'Other';
            if (!acc[spaceName]) {
                acc[spaceName] = [];
            }
            acc[spaceName].push({
                value: d.uuid,
                label: d.name,
                spaceUuid: d.spaceUuid,
            });
            return acc;
        }, {});

        // Convert to Mantine grouped format
        return Object.entries(groupedBySpace).map(([group, items]) => ({
            group,
            items,
        }));
    }, [dashboards, spaces]);

    const form = useForm({
        initialValues: {
            dashboardUuid: '',
            dashboardName: '',
            dashboardDescription: '',
            spaceUuid: currentSpace?.uuid ?? '',
            spaceName: '',
        },
    });

    const {
        data: selectedDashboard,
        isFetching: isFetchingSelectedDashboard,
        isError: isSelectedDashboardError,
    } = useDashboardQuery({
        uuidOrSlug: form.getInputProps('dashboardUuid').value,
        projectUuid,
    });
    const { mutateAsync: createDashboard } = useCreateMutation(
        projectUuid,
        true,
    );
    const { mutateAsync: updateDashboard } = useUpdateDashboard(
        form.getInputProps('dashboardUuid').value,
        projectUuid,
    );
    const { mutateAsync: createSpace } = useSpaceCreateMutation(projectUuid);

    const destinationTab = useMemo(
        () =>
            selectedDashboard
                ? getDestinationDashboardTab({
                      tabs: selectedDashboard.tabs,
                      selectedTabUuid,
                      lastActiveTabUuid: getDashboardActiveTabUuid(
                          selectedDashboard.uuid,
                      ),
                  })
                : null,
        [selectedDashboard, selectedTabUuid, getDashboardActiveTabUuid],
    );

    const handleSubmit = form.onSubmit(
        async ({
            dashboardName,
            dashboardDescription,
            spaceUuid,
            spaceName,
        }) => {
            if (!tile) return;

            setIsLoading(true);

            try {
                if (isCreatingNewSpace) {
                    const newSpace = await createSpace({
                        name: spaceName,
                        inheritParentPermissions: true,
                        access: [],
                    });
                    spaceUuid = newSpace.uuid;
                }

                if (isCreatingNewDashboard) {
                    await createDashboard({
                        name: dashboardName,
                        description: dashboardDescription,
                        spaceUuid: spaceUuid,
                        tiles: [tile.payload],
                        tabs: [],
                    });
                    onClose?.();
                } else {
                    if (!selectedDashboard) {
                        throw new Error(
                            'Dashboard not found or failed to load. Please try selecting a different dashboard.',
                        );
                    }
                    await updateDashboard({
                        name: selectedDashboard.name,
                        filters: selectedDashboard.filters,
                        tiles: appendNewTilesToBottom(selectedDashboard.tiles, [
                            {
                                ...tile.payload,
                                tabUuid: destinationTab?.uuid,
                            },
                        ]),
                        tabs: selectedDashboard.tabs,
                    });
                    onClose?.();
                    void navigate(
                        getTileLinkPath({
                            projectUrlIdentifier: projectUuid,
                            dashboardSlug: selectedDashboard.slug,
                            tileUuid: tile.payload.uuid,
                            tileTabUuid: destinationTab?.uuid ?? null,
                            search: '',
                        }),
                    );
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        },
    );

    const defaultSelectValue = useMemo(() => {
        // Flatten grouped items to find the default value
        const allItems = dashboardSelectItems.flatMap((group) => group.items);
        return allItems.find((d) => d.spaceUuid === currentSpace?.uuid)?.value;
    }, [currentSpace?.uuid, dashboardSelectItems]);

    useEffect(() => {
        if (defaultSelectValue && !form.values.dashboardUuid) {
            form.setValues({ dashboardUuid: defaultSelectValue });
        }
    }, [defaultSelectValue, form]);

    if (isLoadingDashboards || !dashboards || isLoadingSpaces || !spaces) {
        return null;
    }

    const showNewDashboardInput =
        isCreatingNewDashboard || dashboards.length === 0;
    const showNewSpaceInput = isCreatingNewSpace || spaces.length === 0;

    const ADD_TO_DASHBOARD_FORM_ID = 'add-to-dashboard-form';

    const isSubmitDisabled =
        (isCreatingNewDashboard &&
            form.getInputProps('dashboardName').value === '') ||
        (isCreatingNewSpace && form.getInputProps('spaceName').value === '') ||
        (!isCreatingNewDashboard &&
            form.getInputProps('dashboardUuid').value &&
            (isFetchingSelectedDashboard ||
                isSelectedDashboardError ||
                !selectedDashboard));

    return (
        <MantineModal
            opened={isOpen}
            onClose={() => onClose?.()}
            title="Add chart to dashboard"
            icon={IconLayoutDashboard}
            actions={
                <Button
                    type="submit"
                    form={ADD_TO_DASHBOARD_FORM_ID}
                    loading={isLoading || isFetchingSelectedDashboard}
                    disabled={isSubmitDisabled}
                >
                    Add to dashboard
                </Button>
            }
        >
            <form id={ADD_TO_DASHBOARD_FORM_ID} onSubmit={handleSubmit}>
                {!showNewDashboardInput ? (
                    <Stack gap="md">
                        <Select
                            id="select-dashboard"
                            label="Select a dashboard"
                            data={dashboardSelectItems}
                            searchable
                            nothingFoundMessage="No matching dashboards found"
                            required
                            {...form.getInputProps('dashboardUuid')}
                        />
                        <DashboardTabSelect
                            tabs={selectedDashboard?.tabs ?? []}
                            value={destinationTab?.uuid ?? null}
                            onChange={setSelectedTabUuid}
                        />
                        <Anchor
                            component="span"
                            onClick={() => setIsCreatingNewDashboard(true)}
                        >
                            <Group gap="two">
                                <MantineIcon icon={IconPlus} />
                                Create new dashboard
                            </Group>
                        </Anchor>
                    </Stack>
                ) : (
                    <Stack gap="md">
                        <TextInput
                            id="dashboard-name"
                            label="Name your dashboard"
                            placeholder="eg. KPI dashboard"
                            required
                            {...form.getInputProps('dashboardName')}
                        />
                        <Textarea
                            id="dashboard-description"
                            label="Dashboard description"
                            placeholder="A few words to give your team some context"
                            autosize
                            maxRows={3}
                            className={classes.descriptionInput}
                            {...form.getInputProps('dashboardDescription')}
                        />
                        {!isLoadingSpaces && !showNewSpaceInput ? (
                            <>
                                <Select
                                    id="select-space"
                                    label="Select a space"
                                    data={spaces.map((space) => ({
                                        value: space.uuid,
                                        label: space.name,
                                    }))}
                                    defaultValue={currentSpace?.uuid}
                                    required
                                    {...form.getInputProps('spaceUuid')}
                                />
                                <Anchor
                                    component="span"
                                    onClick={() => setIsCreatingNewSpace(true)}
                                >
                                    <Group gap="two">
                                        <MantineIcon icon={IconPlus} />
                                        Create new space
                                    </Group>
                                </Anchor>
                            </>
                        ) : (
                            <>
                                <TextInput
                                    id="new-space"
                                    label="Name your new space"
                                    placeholder="eg. KPIs"
                                    required
                                    {...form.getInputProps('spaceName')}
                                />
                                <Anchor
                                    component="span"
                                    onClick={() => setIsCreatingNewSpace(false)}
                                >
                                    <Group gap="two">
                                        <MantineIcon icon={IconArrowLeft} />
                                        Save to existing space
                                    </Group>
                                </Anchor>
                            </>
                        )}
                    </Stack>
                )}
            </form>
        </MantineModal>
    );
};

export default AddTilesToDashboardModal;
