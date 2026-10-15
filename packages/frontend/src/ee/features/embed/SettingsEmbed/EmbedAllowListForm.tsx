import {
    getAppDisplayName,
    type DashboardBasicDetails,
    type DecodedEmbed,
    type EmbedProjectApp,
    type SavedChart,
    type UpdateEmbed,
} from '@lightdash/common';
import { Button, Flex, MultiSelect, Stack, Switch } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

const EmbedAllowListForm: FC<{
    disabled: boolean;
    embedConfig: DecodedEmbed;
    dashboards: DashboardBasicDetails[];
    charts: Pick<SavedChart, 'uuid' | 'name'>[];
    apps: EmbedProjectApp[];
    showDataApps: boolean;
    onSave: (values: UpdateEmbed) => void;
}> = ({
    disabled,
    embedConfig,
    dashboards,
    charts,
    apps,
    showDataApps,
    onSave,
}) => {
    const { t } = useTranslation('embed');
    const form = useForm({
        initialValues: {
            allowAllDashboards: embedConfig.allowAllDashboards,
            dashboardUuids: embedConfig.dashboardUuids,
            allowAllCharts: embedConfig.allowAllCharts,
            chartUuids: embedConfig.chartUuids,
            allowAllApps: embedConfig.allowAllApps,
            appUuids: embedConfig.appUuids,
        },
    });

    const handleSubmit = form.onSubmit((values) => {
        onSave({
            dashboardUuids: values.dashboardUuids,
            allowAllDashboards: values.allowAllDashboards,
            chartUuids: values.chartUuids,
            allowAllCharts: values.allowAllCharts,
            appUuids: values.appUuids,
            allowAllApps: values.allowAllApps,
        });
    });

    return (
        <form id="add-dashboard-to-embed-config" onSubmit={handleSubmit}>
            <Stack>
                <Switch
                    name="allowAllDashboards"
                    label={t('allowList.allowAllDashboards')}
                    {...form.getInputProps('allowAllDashboards', {
                        type: 'checkbox',
                    })}
                />
                {!form.values.allowAllDashboards && (
                    <MultiSelect
                        required={!form.values.allowAllDashboards}
                        label={t('settings.tabs.dashboards')}
                        data={dashboards.map((dashboard) => ({
                            value: dashboard.uuid,
                            label: dashboard.name,
                        }))}
                        disabled={
                            disabled ||
                            dashboards.length === 0 ||
                            form.values.allowAllDashboards
                        }
                        defaultValue={[]}
                        placeholder={
                            dashboards.length === 0
                                ? t('allowList.noDashboards')
                                : t('allowList.selectDashboard')
                        }
                        searchable
                        description={t('allowList.dashboardsDescription')}
                        {...form.getInputProps('dashboardUuids')}
                    />
                )}
                <Switch
                    name="allowAllCharts"
                    label={t('allowList.allowAllCharts')}
                    {...form.getInputProps('allowAllCharts', {
                        type: 'checkbox',
                    })}
                />
                {!form.values.allowAllCharts && (
                    <MultiSelect
                        required={!form.values.allowAllCharts}
                        label={t('settings.tabs.charts')}
                        data={charts.map((chart) => ({
                            value: chart.uuid,
                            label: chart.name,
                        }))}
                        disabled={
                            disabled ||
                            charts.length === 0 ||
                            form.values.allowAllCharts
                        }
                        defaultValue={[]}
                        placeholder={
                            charts.length === 0
                                ? t('allowList.noCharts')
                                : t('allowList.selectChart')
                        }
                        searchable
                        description={t('allowList.chartsDescription')}
                        {...form.getInputProps('chartUuids')}
                    />
                )}
                {showDataApps && (
                    <>
                        <Switch
                            name="allowAllApps"
                            label={t('allowList.allowAllApps')}
                            {...form.getInputProps('allowAllApps', {
                                type: 'checkbox',
                            })}
                        />
                        {!form.values.allowAllApps && (
                            <MultiSelect
                                required={!form.values.allowAllApps}
                                label={t('settings.tabs.apps')}
                                data={apps.map((app) => ({
                                    value: app.appUuid,
                                    label: getAppDisplayName(
                                        app.name,
                                        app.appUuid,
                                    ),
                                }))}
                                disabled={
                                    disabled ||
                                    apps.length === 0 ||
                                    form.values.allowAllApps
                                }
                                defaultValue={[]}
                                placeholder={
                                    apps.length === 0
                                        ? t('allowList.noApps')
                                        : t('allowList.selectApp')
                                }
                                searchable
                                description={t('allowList.appsDescription')}
                                {...form.getInputProps('appUuids')}
                            />
                        )}
                    </>
                )}
                <Flex justify="flex-end" gap="sm">
                    <Button
                        type="submit"
                        disabled={
                            disabled ||
                            (dashboards.length === 0 &&
                                charts.length === 0 &&
                                (!showDataApps || apps.length === 0))
                        }
                    >
                        {t('allowList.save')}
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default EmbedAllowListForm;
