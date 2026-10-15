import {
    DashboardTileTypes,
    getDefaultChartTileSize,
    type CreateChartInDashboard,
    type CreateDashboardChartTile,
    type CreateSavedChartVersion,
    type DashboardTile,
} from '@lightdash/common';
import { Button, Group, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useCallback, useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { v4 as uuid4 } from 'uuid';
import { z } from 'zod';
import {
    appendNewTilesToBottom,
    useDashboardQuery,
} from '../../../../hooks/dashboard/useDashboard';
import useDashboardStorage from '../../../../hooks/dashboard/useDashboardStorage';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useOptionalProjectRoute } from '../../../../hooks/useProjectRoute';
import { useCreateMutation } from '../../../../hooks/useSavedQuery';
import i18n from '../../../../i18n/i18n';
import {
    useIsModalHosted,
    useModalHostedChartSaved,
} from '../../../../providers/Explorer/useIsModalHosted';
import classes from './ChartCreateModal.module.css';
import { DEFAULT_CHART_METADATA, type ChartMetadata } from './types';

type Props = {
    dashboardName: string | null;
    dashboardUuid: string | null;
    savedData: CreateSavedChartVersion;
    projectUuid?: string;
    onClose: () => void;
    defaults?: ChartMetadata;
    /** Chart-level palette chosen before the first save. */
    colorPaletteUuid?: string | null;
};

type SaveToDashboardFormValues = { name: string; description: string };

const validationSchema = z.object({
    name: z.string().min(1, {
        error: () => i18n.t('validation.nameRequired', { ns: 'modals' }),
    }),
    description: z.string(),
});

type FormValues = z.infer<typeof validationSchema>;

export const SaveToDashboard: FC<Props> = ({
    savedData,
    dashboardName,
    dashboardUuid,
    projectUuid,
    onClose,
    defaults = DEFAULT_CHART_METADATA,
    colorPaletteUuid,
}) => {
    const { t } = useTranslation('modals');
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    const [dashboardInfoFromStorage, setDashboardInfoFromStorage] = useState({
        name: dashboardName,
        dashboardUuid,
    });
    const { getEditingDashboardInfo } = useDashboardStorage();
    const editingDashboardInfo = getEditingDashboardInfo();
    const { data: selectedDashboard } = useDashboardQuery({
        uuidOrSlug: dashboardUuid || undefined,
        projectUuid,
    });
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
    const navigate = useNavigate();
    const isModalHosted = useIsModalHosted();
    const onModalHostChartSaved = useModalHostedChartSaved();

    const { mutateAsync: createChart } = useCreateMutation({
        redirectOnSuccess: false,
        showToastOnSuccess: false,
    });
    const {
        getUnsavedDashboardTiles,
        setUnsavedDashboardTiles,
        getDashboardActiveTabUuid,
    } = useDashboardStorage();
    const form = useForm<FormValues>({
        initialValues: {
            ...defaults,
        },
        validate: zodResolver(validationSchema),
    });

    const handleSaveChartInDashboard = useCallback(
        async (values: SaveToDashboardFormValues) => {
            if (!dashboardUuid || !projectUuid) {
                return;
            }
            const activeTabUuid = getDashboardActiveTabUuid(dashboardUuid);
            const newChartInDashboard: CreateChartInDashboard = {
                ...savedData,
                name: values.name,
                description: values.description,
                colorPaletteUuid,
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
            // Modal-hosted: delegate to host, skip dashboard storage and navigation.
            if (isModalHosted) {
                onModalHostChartSaved?.(chart);
                showToastSuccess({
                    title: t('saveToDashboard.addedToast', {
                        chartName: values.name,
                        dashboardName,
                    }),
                });
                onClose();
                return;
            }

            const unsavedDashboardTiles =
                getUnsavedDashboardTiles(dashboardUuid);
            const existingTiles =
                unsavedDashboardTiles.length > 0
                    ? unsavedDashboardTiles
                    : selectedDashboard?.tiles;

            setUnsavedDashboardTiles(
                dashboardUuid,
                appendNewTilesToBottom<
                    DashboardTile | CreateDashboardChartTile
                >(existingTiles || [], [newTile]),
            );
            void navigate(
                activeTabUuid
                    ? `/projects/${projectUrlIdentifier}/dashboards/${selectedDashboard?.slug ?? dashboardUuid}/edit/tabs/${activeTabUuid}`
                    : `/projects/${projectUrlIdentifier}/dashboards/${selectedDashboard?.slug ?? dashboardUuid}/edit`,
            );
            showToastSuccess({
                title: t('saveToDashboard.addedToast', {
                    chartName: values.name,
                    dashboardName,
                }),
            });
        },
        [
            savedData,
            colorPaletteUuid,
            dashboardUuid,
            createChart,
            getDashboardActiveTabUuid,
            getUnsavedDashboardTiles,
            setUnsavedDashboardTiles,
            navigate,
            projectUuid,
            projectUrlIdentifier,
            showToastSuccess,
            dashboardName,
            selectedDashboard?.tiles,
            selectedDashboard?.slug,
            isModalHosted,
            onModalHostChartSaved,
            onClose,
            t,
        ],
    );
    return (
        <form
            onSubmit={form.onSubmit((values) =>
                handleSaveChartInDashboard(values),
            )}
        >
            <Stack gap="md" p="md">
                <Stack gap="xs">
                    <TextInput
                        label={t('chartForm.nameLabel')}
                        placeholder={t('chartForm.namePlaceholder')}
                        required
                        {...form.getInputProps('name')}
                        data-testid="ChartCreateModal/NameInput"
                    />
                    <Textarea
                        label={t('chartForm.descriptionLabel')}
                        placeholder={t('descriptionPlaceholder')}
                        autosize
                        maxRows={3}
                        {...form.getInputProps('description')}
                    />
                </Stack>
                <Stack gap={4}>
                    <Text fw={500}>
                        {t('saveToDashboard.savingTo', { dashboardName })}
                    </Text>
                    <Text fw={400} c="dimmed" fz="xs">
                        {t('saveToDashboard.exclusiveDescription', {
                            dashboardName,
                        })}
                    </Text>
                </Stack>
            </Stack>

            <Group justify="flex-end" gap="sm" className={classes.footer}>
                <Button onClick={onClose} variant="default">
                    {t('actions.cancel', { ns: 'common' })}
                </Button>

                <Button type="submit" disabled={!form.values.name}>
                    {t('actions.save', { ns: 'common' })}
                </Button>
            </Group>
        </form>
    );
};
