import { subject } from '@casl/ability';
import {
    DashboardTileTypes,
    getDefaultChartTileSize,
    type CreateSavedChartVersion,
    type DashboardBasicDetails,
    type DashboardChartTile,
    type DashboardVersionedFields,
    type SavedChart,
    type SpaceSummary,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Loader,
    LoadingOverlay,
    Radio,
    Select,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine/core';
import { useForm, zodResolver, type UseFormReturnType } from '@mantine/form';
import { uuid4 } from '@sentry/utils';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import { useParams } from 'react-router-dom';
import { z } from 'zod';
import {
    appendNewTilesToBottom,
    useDashboardQuery,
    useUpdateDashboard,
} from '../../../../hooks/dashboard/useDashboard';
import { useDashboards } from '../../../../hooks/dashboard/useDashboards';
import { useCreateMutation } from '../../../../hooks/useSavedQuery';
import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaceSummaries,
} from '../../../../hooks/useSpaces';
import { useApp } from '../../../../providers/AppProvider';
import { Can } from '../../Authorization';
import MantineIcon from '../../MantineIcon';

export enum SaveDestination {
    Dashboard = 'dashboard',
    Space = 'space',
}

export const validationSchema = z.object({
    name: z.string().nonempty(),
    spaceUuid: z.string().optional(),
    dashboardUuid: z.string().optional(),
    dashboardName: z.string().optional(),
    description: z.string().optional(),
    newSpaceName: z.string().or(z.null()).optional(),
    saveDestination: z
        .nativeEnum(SaveDestination)
        .default(SaveDestination.Space),
});

export type FormValues = z.infer<typeof validationSchema>;

export type SaveToSpaceProps = {
    form: UseFormReturnType<FormValues>;
    spaces: SpaceSummary[] | undefined;
    projectUuid: string;
};

export const SaveToSpace: FC<SaveToSpaceProps> = ({
    form,
    spaces,
    projectUuid,
}) => {
    const { user } = useApp();
    const [shouldCreateNewSpace, setShouldCreateNewSpace] = useState(false);
    const isCreatingNewSpace =
        shouldCreateNewSpace || !spaces || spaces.length === 0;

    if (isCreatingNewSpace) {
        return (
            <Stack spacing="xs">
                <TextInput
                    size="xs"
                    label="Space"
                    description="Create a new space to add this chart to"
                    placeholder="eg. KPIs"
                    {...form.getInputProps('newSpaceName')}
                />
                <Button
                    size="xs"
                    variant="default"
                    mr="auto"
                    compact
                    onClick={() => {
                        setShouldCreateNewSpace(false);
                        form.setFieldValue('newSpaceName', undefined);
                    }}
                    leftIcon={<MantineIcon icon={IconArrowLeft} />}
                >
                    Save to existing space
                </Button>
            </Stack>
        );
    }

    return (
        <Stack spacing="xs">
            <Select
                size="xs"
                searchable
                label="Space"
                description="Select a space to save the chart directly to"
                withinPortal
                data={spaces.map((space) => ({
                    value: space.uuid,
                    label: space.name,
                }))}
                {...form.getInputProps('spaceUuid')}
                required={form.values.saveDestination === SaveDestination.Space}
            />
            <Can
                I="create"
                this={subject('Space', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                })}
            >
                <Button
                    size="xs"
                    variant="default"
                    mr="auto"
                    compact
                    leftIcon={<MantineIcon icon={IconPlus} />}
                    onClick={() => setShouldCreateNewSpace(true)}
                >
                    Create new space
                </Button>
            </Can>
        </Stack>
    );
};

type SaveToDashboardProps = Pick<SaveToSpaceProps, 'form' | 'spaces'> & {
    dashboards: DashboardBasicDetails[] | undefined;
    isLoadingDashboards: boolean;
};

const SaveToDashboard: FC<SaveToDashboardProps> = ({
    form,
    spaces,
    dashboards,
    isLoadingDashboards,
}) => {
    if (!dashboards) return null;

    return (
        <Select
            description="Select a dashboard to save the chart directly to"
            id="select-dashboard"
            label="Dashboard"
            size="xs"
            data={dashboards.map((d) => ({
                value: d.uuid,
                label: d.name,
                group: (spaces ?? []).find((s) => s.uuid === d.spaceUuid)?.name,
            }))}
            rightSection={isLoadingDashboards && <Loader size="xs" />}
            defaultValue={
                dashboards.find((d) => d.spaceUuid === form.values.spaceUuid)
                    ?.uuid
            }
            searchable
            nothingFound="No matching dashboards found"
            filter={(value, dashboard) =>
                !!dashboard.label
                    ?.toLowerCase()
                    .includes(value.toLowerCase().trim())
            }
            withinPortal
            required={form.values.saveDestination === SaveDestination.Dashboard}
            {...form.getInputProps('dashboardUuid')}
        />
    );
};

type SaveToSpaceOrDashboardProps = {
    projectUuid: string;
    savedData: CreateSavedChartVersion;
    defaultSpaceUuid: string | undefined;
    dashboardInfoFromSavedData: {
        dashboardUuid: string | null;
        dashboardName: string | null;
    };
    onConfirm: (savedData: CreateSavedChartVersion) => void;
    onClose: () => void;
};

export const SaveToSpaceOrDashboard: FC<SaveToSpaceOrDashboardProps> = ({
    savedData,
    defaultSpaceUuid,
    dashboardInfoFromSavedData,
    onConfirm,
    onClose,
}) => {
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { mutateAsync: createChart } = useCreateMutation();

    const { mutateAsync: createSpace } = useSpaceCreateMutation(projectUuid);

    const form = useForm<FormValues>({
        validate: zodResolver(validationSchema),
    });

    const {
        data: dashboards,
        isInitialLoading: isLoadingDashboards,
        isSuccess: isDashboardsSuccess,
    } = useDashboards(projectUuid, {
        staleTime: 0,
    });

    const {
        data: spaces,
        isInitialLoading: isLoadingSpaces,
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

    useEffect(() => {
        if (form.initialized) return;

        if (isSpacesSuccess && isDashboardsSuccess) {
            let initialSpaceUuid;

            const isValidDefaultSpaceUuid = spaces.some(
                (space) => space.uuid === defaultSpaceUuid,
            );

            if (spaces && spaces.length > 0) {
                initialSpaceUuid = isValidDefaultSpaceUuid
                    ? defaultSpaceUuid
                    : spaces[0].uuid;
            }

            let initialValues = {
                name: '',
                saveDestination: SaveDestination.Space,
                ...(dashboardInfoFromSavedData.dashboardUuid && {
                    dashboardUuid: dashboardInfoFromSavedData.dashboardUuid,
                }),
                ...(dashboardInfoFromSavedData.dashboardName && {
                    dashboardName: dashboardInfoFromSavedData.dashboardName,
                }),
                ...(initialSpaceUuid && { spaceUuid: initialSpaceUuid }),
            };

            form.initialize(initialValues);
        }
    }, [
        dashboardInfoFromSavedData.dashboardName,
        dashboardInfoFromSavedData.dashboardUuid,
        defaultSpaceUuid,
        form,
        isDashboardsSuccess,
        isSpacesSuccess,
        spaces,
    ]);

    const { mutateAsync: updateDashboard } = useUpdateDashboard(
        form.values.dashboardUuid,
    );
    const { data: selectedDashboard } = useDashboardQuery(
        form.values.dashboardUuid,
    );

    const handleOnSubmit = useCallback(
        async (values: FormValues) => {
            let savedQuery: SavedChart | undefined;
            /**
             * Create chart
             * Save to dashboard by creating a new tile and then updating the dashboard by sending it to the bottom
             */
            if (values.saveDestination === SaveDestination.Dashboard) {
                if (!selectedDashboard) {
                    throw new Error('Expected dashboard');
                }
                savedQuery = await createChart({
                    ...savedData,
                    name: values.name,
                    description: values.description,
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
            if (values.saveDestination === SaveDestination.Space) {
                let newSpace = values.newSpaceName
                    ? await createSpace({
                          name: values.newSpaceName,
                          access: [],
                          isPrivate: true,
                      })
                    : undefined;
                const spaceUuid = newSpace?.uuid || values.spaceUuid;

                savedQuery = await createChart({
                    ...savedData,
                    name: values.name,
                    description: values.description,
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
            createSpace,
            selectedDashboard,
            createChart,
            savedData,
            updateDashboard,
            onConfirm,
        ],
    );

    return (
        <form onSubmit={form.onSubmit((values) => handleOnSubmit(values))}>
            <LoadingOverlay visible={isLoadingSpaces} />
            <Box p="md">
                <Stack spacing="xs">
                    <TextInput
                        label="Chart Name"
                        placeholder="eg. How many weekly active users do we have?"
                        required
                        {...form.getInputProps('name')}
                        data-testid="ChartCreateModal/NameInput"
                    />
                    <Textarea
                        label="Chart description"
                        placeholder="A few words to give your team some context"
                        autosize
                        maxRows={3}
                        {...form.getInputProps('description')}
                    />
                </Stack>

                <Stack spacing="sm" mt="sm">
                    <Radio.Group
                        size="xs"
                        value={form.values.saveDestination}
                        {...form.getInputProps('saveDestination')}
                    >
                        <Group spacing="xs" mb="xs">
                            <Text fw={500}>Save to</Text>

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
                        </Group>
                        {form.values.saveDestination ===
                            SaveDestination.Space && (
                            <SaveToSpace
                                projectUuid={projectUuid}
                                form={form}
                                spaces={spaces}
                            />
                        )}
                        {form.values.saveDestination ===
                            SaveDestination.Dashboard && (
                            <SaveToDashboard
                                form={form}
                                spaces={spaces}
                                dashboards={dashboards}
                                isLoadingDashboards={isLoadingDashboards}
                            />
                        )}
                    </Radio.Group>
                </Stack>
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
                <Button onClick={onClose} variant="outline">
                    Cancel
                </Button>

                <Button
                    type="submit"
                    disabled={
                        !form.values.name ||
                        (!form.values.newSpaceName &&
                            form.values.saveDestination ===
                                SaveDestination.Space &&
                            !form.values.spaceUuid) ||
                        (!form.values.dashboardUuid &&
                            form.values.saveDestination ===
                                SaveDestination.Dashboard)
                    }
                >
                    Save
                </Button>
            </Group>
        </form>
    );
};
