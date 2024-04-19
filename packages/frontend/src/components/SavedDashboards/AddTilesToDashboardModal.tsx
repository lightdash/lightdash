import {
    DashboardTileTypes,
    getDefaultChartTileSize,
    type DashboardChartTile,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Group,
    Modal,
    Select,
    Stack,
    Textarea,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconArrowLeft,
    IconLayoutDashboard,
    IconPlus,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { v4 as uuid4 } from 'uuid';
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
    savedChartUuid: string;
    onClose?: () => void;
}

const AddTilesToDashboardModal: FC<AddTilesToDashboardModalProps> = ({
    isOpen,
    projectUuid,
    savedChartUuid,
    onClose,
}) => {
    const [isCreatingNewDashboard, setIsCreatingNewDashboard] = useState(false);
    const [isCreatingNewSpace, setIsCreatingNewSpace] =
        useState<boolean>(false);
    const [isLoading, setIsLoading] = useState(false);

    const { data: savedChart } = useSavedQuery({ id: savedChartUuid });
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
    const currentSpace = spaces?.find((s) => s.uuid === savedChart?.spaceUuid);

    const form = useForm({
        initialValues: {
            dashboardUuid:
                dashboards?.find((d) => d.spaceUuid === currentSpace?.uuid)
                    ?.uuid ?? '',
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
            if (!savedChart) return;

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
                const newTile: DashboardChartTile = {
                    uuid: uuid4(),
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: {
                        savedChartUuid: savedChart.uuid,
                    },
                    tabUuid: undefined,
                    ...getDefaultChartTileSize(savedChart.chartConfig?.type),
                };

                if (isCreatingNewDashboard) {
                    await createDashboard({
                        name: dashboardName,
                        description: dashboardDescription,
                        spaceUuid: spaceUuid,
                        tiles: [
                            {
                                uuid: uuid4(),
                                type: DashboardTileTypes.SAVED_CHART,
                                tabUuid: undefined,
                                properties: {
                                    savedChartUuid: savedChart.uuid,
                                },
                                ...getDefaultChartTileSize(
                                    savedChart?.chartConfig.type,
                                ),
                            },
                        ],
                        tabs: [],
                    });
                    onClose?.();
                } else {
                    if (!selectedDashboard) {
                        throw new Error('Expected dashboard');
                    }
                    await updateDashboard({
                        name: selectedDashboard.name,
                        filters: selectedDashboard.filters,
                        tiles: appendNewTilesToBottom(selectedDashboard.tiles, [
                            newTile,
                        ]),
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
                    <Title order={4}> Add chart to dashboard</Title>
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
                                data={dashboards.map((d) => ({
                                    value: d.uuid,
                                    label: d.name,
                                    group: spaces.find(
                                        (s) => s.uuid === d.spaceUuid,
                                    )?.name,
                                }))}
                                defaultValue={
                                    dashboards.find(
                                        (d) =>
                                            d.spaceUuid === currentSpace?.uuid,
                                    )?.uuid
                                }
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
