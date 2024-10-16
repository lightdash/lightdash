import { subject } from '@casl/ability';
import {
    assertUnreachable,
    DashboardTileTypes,
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
    Textarea,
    TextInput,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { uuid4 } from '@sentry/utils';
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
import SaveToDashboardForm, {
    saveToDashboardSchema,
} from './SaveToDashboardForm';
import SaveToSpaceForm, { saveToSpaceSchema } from './SaveToSpaceForm';

enum SaveDestination {
    Dashboard = 'dashboard',
    Space = 'space',
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

export const SaveToSpaceOrDashboard: FC<Props> = ({
    savedData,
    defaultSpaceUuid,
    dashboardInfoFromSavedData,
    onConfirm,
    onClose,
}) => {
    const { user } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { mutateAsync: createChart, isLoading: isSavingChart } =
        useCreateMutation();
    const { mutateAsync: createSpace, isLoading: isSavingSpace } =
        useSpaceCreateMutation(projectUuid);

    const [saveDestination, setSaveDestination] = useState<SaveDestination>(
        SaveDestination.Space,
    );

    const form = useForm<FormValues>({
        validate: zodResolver(saveToSpaceOrDashboardSchema),
    });

    const {
        data: dashboards,
        isLoading: isLoadingDashboards,
        isSuccess: isDashboardsSuccess,
    } = useDashboards(projectUuid, {
        staleTime: 0,
    });

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

    useEffect(() => {
        if (!isSpacesSuccess || !isDashboardsSuccess) return;
        if (form.initialized) return;

        const isValidDefaultSpaceUuid = spaces.some(
            (space) => space.uuid === defaultSpaceUuid,
        );

        const initialSpaceUuid = isValidDefaultSpaceUuid
            ? defaultSpaceUuid
            : spaces[0].uuid;

        const initialValues: FormValues = {
            name: '',
            description: null,

            newSpaceName: null,

            dashboardUuid: dashboardInfoFromSavedData.dashboardUuid,
            spaceUuid: initialSpaceUuid ?? null,
        };

        form.initialize(initialValues);
    }, [
        form,
        dashboardInfoFromSavedData.dashboardUuid,
        defaultSpaceUuid,
        isDashboardsSuccess,
        isSpacesSuccess,
        spaces,
    ]);

    const { mutateAsync: updateDashboard } = useUpdateDashboard(
        form.values.dashboardUuid ?? undefined,
    );
    const { data: selectedDashboard } = useDashboardQuery(
        form.values.dashboardUuid ?? undefined,
    );

    const handleOnSubmit = useCallback(
        async (values: FormValues) => {
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
                    ? await createSpace({
                          name: values.newSpaceName,
                          access: [],
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
            saveDestination,
            selectedDashboard,
            createChart,
            savedData,
            updateDashboard,
            createSpace,
            onConfirm,
        ],
    );

    const isLoading =
        !form.initialized ||
        isLoadingDashboards ||
        isLoadingSpaces ||
        isSavingChart ||
        isSavingSpace;

    return (
        <form onSubmit={form.onSubmit((values) => handleOnSubmit(values))}>
            <LoadingOverlay visible={isLoading} />

            <Box p="md">
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
                </Stack>

                <Stack spacing="sm" mt="sm">
                    <Radio.Group
                        size="xs"
                        value={saveDestination}
                        onChange={(value: SaveDestination) =>
                            setSaveDestination(value)
                        }
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

                        {saveDestination === SaveDestination.Space ? (
                            <SaveToSpaceForm
                                form={form}
                                isLoading={isLoadingSpaces}
                                spaces={spaces}
                                projectUuid={projectUuid}
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
                    loading={isSavingChart || isSavingSpace}
                    disabled={
                        !form.values.name ||
                        (!form.values.newSpaceName &&
                            saveDestination === SaveDestination.Space &&
                            !form.values.spaceUuid) ||
                        (!form.values.dashboardUuid &&
                            saveDestination === SaveDestination.Dashboard)
                    }
                >
                    Save
                </Button>
            </Group>
        </form>
    );
};
