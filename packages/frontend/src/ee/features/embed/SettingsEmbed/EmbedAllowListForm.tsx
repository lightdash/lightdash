import {
    type DashboardBasicDetails,
    type DecodedEmbed,
    type EmbedProjectApp,
    type SavedChart,
    type UpdateEmbed,
} from '@lightdash/common';
import { Button, Flex, MultiSelect, Stack, Switch } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';

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
                    label="Allow all dashboards"
                    {...form.getInputProps('allowAllDashboards', {
                        type: 'checkbox',
                    })}
                />
                {!form.values.allowAllDashboards && (
                    <MultiSelect
                        required={!form.values.allowAllDashboards}
                        label={'Dashboards'}
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
                                ? 'No dashboards available to embed'
                                : 'Select a dashboard...'
                        }
                        searchable
                        description="Only these dashboards will be allowed to be embedded."
                        {...form.getInputProps('dashboardUuids')}
                    />
                )}
                <Switch
                    name="allowAllCharts"
                    label="Allow all charts"
                    {...form.getInputProps('allowAllCharts', {
                        type: 'checkbox',
                    })}
                />
                {!form.values.allowAllCharts && (
                    <MultiSelect
                        required={!form.values.allowAllCharts}
                        label={'Charts'}
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
                                ? 'No charts available to embed'
                                : 'Select a chart...'
                        }
                        searchable
                        description="Only these charts will be allowed to be embedded."
                        {...form.getInputProps('chartUuids')}
                    />
                )}
                {showDataApps && (
                    <>
                        <Switch
                            name="allowAllApps"
                            label="Allow all data apps"
                            {...form.getInputProps('allowAllApps', {
                                type: 'checkbox',
                            })}
                        />
                        {!form.values.allowAllApps && (
                            <MultiSelect
                                required={!form.values.allowAllApps}
                                label={'Data apps'}
                                data={apps.map((app) => ({
                                    value: app.appUuid,
                                    label: app.name,
                                }))}
                                disabled={
                                    disabled ||
                                    apps.length === 0 ||
                                    form.values.allowAllApps
                                }
                                defaultValue={[]}
                                placeholder={
                                    apps.length === 0
                                        ? 'No data apps available to embed'
                                        : 'Select a data app...'
                                }
                                searchable
                                description="Only these data apps will be allowed to be embedded standalone."
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
                        Save changes
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default EmbedAllowListForm;
