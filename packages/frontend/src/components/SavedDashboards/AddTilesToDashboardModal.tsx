import {
    DashboardTileTypes,
    assertUnreachable,
    getDefaultChartTileSize,
    type DashboardTile,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Group,
    Modal,
    Select,
    Stack,
    TextInput,
    Textarea,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconArrowLeft,
    IconLayoutDashboard,
    IconPlus,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { v4 as uuid4 } from 'uuid';
import { useSavedSqlChart } from '../../features/sqlRunner/hooks/useSavedSqlCharts';
import {
    appendNewTilesToBottom,
    useCreateMutation,
    useDashboardQuery,
    useUpdateDashboard,
} from '../../hooks/dashboard/useDashboard';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaceSummaries,
} from '../../hooks/useSpaces';
import MantineIcon from '../common/MantineIcon';

interface AddTilesToDashboardModalProps {
    isOpen: boolean;
    projectUuid: string;
    uuid: string;
    dashboardTileType: DashboardTileTypes;
    onClose?: () => void;
}

interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
    label: string;
    value: string;
    disabled?: boolean;
    spaceUuid: string;
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

    const exploreChartQuery = useSavedQuery({
        id: uuid,
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
            onSuccess: (data) => {
                if (data.length === 0) {
                    setIsCreatingNewSpace(true);
                }
            },
        });

    const currentSpace = spaces?.find((s) => s.uuid === tile?.props.spaceUuid);

    const dashboardSelectItems = useMemo(() => {
        return (
            dashboards?.map<ItemProps>((d) => ({
                value: d.uuid,
                label: d.name,
                group: spaces?.find((s) => s.uuid === d.spaceUuid)?.name,
                spaceUuid: d.spaceUuid, // ? Adding spaceUuid here for simplicity of selecting the default value in the select
            })) ?? []
        );
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

    const { data: selectedDashboard } = useDashboardQuery(
        form.getInputProps('dashboardUuid').value,
    );
    const { mutateAsync: createDashboard } = useCreateMutation(
        projectUuid,
        true,
    );
    const { mutateAsync: updateDashboard } = useUpdateDashboard(
        form.getInputProps('dashboardUuid').value,
        true,
    );
    const { mutateAsync: createSpace } = useSpaceCreateMutation(projectUuid);

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
                        isPrivate: false,
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
                        throw new Error('Expected dashboard');
                    }
                    const firstTab = selectedDashboard.tabs?.[0];
                    await updateDashboard({
                        name: selectedDashboard.name,
                        filters: selectedDashboard.filters,
                        tiles: appendNewTilesToBottom(selectedDashboard.tiles, [
                            firstTab
                                ? {
                                      ...tile.payload,
                                      tabUuid: firstTab.uuid,
                                  }
                                : tile.payload, // TODO: add to first tab by default, need ux to allow user select tab
                        ]),
                        tabs: selectedDashboard.tabs,
                    });
                    onClose?.();
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        },
    );

    const defaultSelectValue = useMemo(
        () =>
            dashboardSelectItems.find(
                (d) => d.spaceUuid === currentSpace?.uuid && !d.disabled,
            )?.value,
        [currentSpace?.uuid, dashboardSelectItems],
    );

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

    return (
        <Modal
            opened={isOpen}
            onClose={() => onClose?.()}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconLayoutDashboard}
                        size="lg"
                        color="green.8"
                    />
                    <Title order={4}>Add chart to dashboard</Title>
                </Group>
            }
            withCloseButton
        >
            <Stack spacing="md" mih="100%">
                <form onSubmit={handleSubmit}>
                    {!showNewDashboardInput ? (
                        <Stack spacing="md">
                            <Select
                                id="select-dashboard"
                                label="Select a dashboard"
                                data={dashboardSelectItems}
                                searchable
                                nothingFound="No matching dashboards found"
                                filter={(value, dashboard) =>
                                    !!dashboard.label
                                        ?.toLowerCase()
                                        .includes(value.toLowerCase().trim())
                                }
                                withinPortal
                                required
                                {...form.getInputProps('dashboardUuid')}
                            />
                            <Anchor
                                component="span"
                                onClick={() => setIsCreatingNewDashboard(true)}
                            >
                                <Group spacing="two">
                                    <MantineIcon icon={IconPlus} />
                                    Create new dashboard
                                </Group>
                            </Anchor>
                        </Stack>
                    ) : (
                        <Stack spacing="md">
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
                                style={{ overflowY: 'auto' }}
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
                                        withinPortal
                                        {...form.getInputProps('spaceUuid')}
                                    />
                                    <Anchor
                                        component="span"
                                        onClick={() =>
                                            setIsCreatingNewSpace(true)
                                        }
                                    >
                                        <Group spacing="two">
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
                                        onClick={() =>
                                            setIsCreatingNewSpace(false)
                                        }
                                    >
                                        <Group spacing="two">
                                            <MantineIcon icon={IconArrowLeft} />
                                            Save to existing space
                                        </Group>
                                    </Anchor>
                                </>
                            )}
                        </Stack>
                    )}
                    <Group spacing="xs" position="right" mt="md">
                        <Button
                            onClick={() => {
                                if (onClose) onClose();
                                setIsCreatingNewDashboard(false);
                            }}
                            variant="outline"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            loading={isLoading}
                            disabled={
                                (isCreatingNewDashboard &&
                                    form.getInputProps('dashboardName')
                                        .value === '') ||
                                (isCreatingNewSpace &&
                                    form.getInputProps('spaceName').value ===
                                        '')
                            }
                        >
                            Add to dashboard
                        </Button>
                    </Group>
                </form>
            </Stack>
        </Modal>
    );
};

export default AddTilesToDashboardModal;
