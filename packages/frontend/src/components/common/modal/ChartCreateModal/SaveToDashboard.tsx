import {
    DashboardTileTypes,
    getDefaultChartTileSize,
    type CreateChartInDashboard,
    type CreateDashboardChartTile,
    type CreateSavedChartVersion,
} from '@lightdash/common';
import { Button, Group, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { uuid4 } from '@sentry/utils';
import { useCallback, useEffect, useState, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import { z } from 'zod';
import {
    appendNewTilesToBottom,
    useDashboardQuery,
} from '../../../../hooks/dashboard/useDashboard';
import useDashboardStorage from '../../../../hooks/dashboard/useDashboardStorage';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useCreateMutation } from '../../../../hooks/useSavedQuery';

type Props = {
    dashboardName: string | null;
    dashboardUuid: string | null;
    savedData: CreateSavedChartVersion;
    projectUuid: string;
    onClose: () => void;
};

type SaveToDashboardFormValues = { name: string; description: string };

const validationSchema = z.object({
    name: z.string().nonempty(),
    description: z.string(),
});

type FormValues = z.infer<typeof validationSchema>;

export const SaveToDashboard: FC<Props> = ({
    savedData,
    dashboardName,
    dashboardUuid,
    projectUuid,
    onClose,
}) => {
    const [dashboardInfoFromStorage, setDashboardInfoFromStorage] = useState({
        name: dashboardName,
        dashboardUuid,
    });
    const { getEditingDashboardInfo } = useDashboardStorage();
    const editingDashboardInfo = getEditingDashboardInfo();
    const { data: selectedDashboard } = useDashboardQuery(
        dashboardUuid || undefined,
    );
    useEffect(() => {
        if (
            dashboardInfoFromStorage.name &&
            dashboardInfoFromStorage.dashboardUuid
        ) {
            return;
        }
        // retry getting dashboard info from storage if it's not available yet
        if (editingDashboardInfo.name && editingDashboardInfo.dashboardUuid) {
            setDashboardInfoFromStorage({
                name: editingDashboardInfo.name,
                dashboardUuid: editingDashboardInfo.dashboardUuid,
            });
        }
    }, [
        dashboardInfoFromStorage.dashboardUuid,
        dashboardInfoFromStorage.name,
        editingDashboardInfo.dashboardUuid,
        editingDashboardInfo.name,
    ]);

    const { showToastSuccess } = useToaster();
    const history = useHistory();

    const { mutateAsync: createChart } = useCreateMutation();
    const {
        clearIsEditingDashboardChart,
        getUnsavedDashboardTiles,
        setUnsavedDashboardTiles,
        getDashboardActiveTabUuid,
    } = useDashboardStorage();
    const unsavedDashboardTiles = getUnsavedDashboardTiles();
    const form = useForm<FormValues>({
        initialValues: {
            name: '',
            description: '',
        },
        validate: zodResolver(validationSchema),
    });

    const activeTabUuid = getDashboardActiveTabUuid();

    const handleSaveChartInDashboard = useCallback(
        async (values: SaveToDashboardFormValues) => {
            if (!dashboardUuid) {
                return;
            }
            const newChartInDashboard: CreateChartInDashboard = {
                ...savedData,
                name: values.name,
                description: values.description,
                dashboardUuid,
            };
            const chart = await createChart(newChartInDashboard);
            const newTile: CreateDashboardChartTile = {
                uuid: uuid4(),
                type: DashboardTileTypes.SAVED_CHART,
                tabUuid: activeTabUuid ?? undefined,
                properties: {
                    belongsToDashboard: true,
                    savedChartUuid: chart.uuid,
                    chartName: newChartInDashboard.name,
                },
                ...getDefaultChartTileSize(savedData.chartConfig?.type),
            };
            const existingTiles =
                unsavedDashboardTiles?.length > 0
                    ? unsavedDashboardTiles
                    : selectedDashboard?.tiles;

            setUnsavedDashboardTiles(
                appendNewTilesToBottom(existingTiles || [], [newTile]),
            );

            clearIsEditingDashboardChart();
            history.push(
                `/projects/${projectUuid}/dashboards/${dashboardUuid}/edit`,
            );
            showToastSuccess({
                title: `Success! ${values.name} was added to ${dashboardName}`,
            });
        },
        [
            savedData,
            dashboardUuid,
            createChart,
            setUnsavedDashboardTiles,
            unsavedDashboardTiles,
            clearIsEditingDashboardChart,
            history,
            projectUuid,
            showToastSuccess,
            dashboardName,
            activeTabUuid,
            selectedDashboard?.tiles,
        ],
    );
    return (
        <form
            onSubmit={form.onSubmit((values) =>
                handleSaveChartInDashboard(values),
            )}
        >
            <Stack p="md">
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
                <Stack spacing="xxs">
                    <Text fw={500}>Saving to "{dashboardName}" dashboard</Text>
                    <Text fw={400} color="gray.6" fz="xs">
                        This chart will be saved exclusively to the dashboard "
                        {dashboardName}", keeping your space clutter-free.
                    </Text>
                </Stack>
            </Stack>

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

                <Button type="submit" disabled={!form.values.name}>
                    Save
                </Button>
            </Group>
        </form>
    );
};
