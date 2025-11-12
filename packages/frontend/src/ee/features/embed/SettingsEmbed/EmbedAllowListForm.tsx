import {
    type DashboardBasicDetails,
    type DecodedEmbed,
    type SavedChart,
    type UpdateEmbed,
} from '@lightdash/common';
import { Button, Flex, MultiSelect, Stack, Switch } from '@mantine/core';
import { useForm } from '@mantine/form';
import React, { type FC } from 'react';

const EmbedAllowListForm: FC<{
    disabled: boolean;
    embedConfig: DecodedEmbed;
    dashboards: DashboardBasicDetails[];
    charts: Pick<SavedChart, 'uuid' | 'name'>[];
    onSave: (values: UpdateEmbed) => void;
}> = ({ disabled, embedConfig, dashboards, charts, onSave }) => {
    const form = useForm({
        initialValues: {
            allowAllDashboards: embedConfig.allowAllDashboards,
            dashboardUuids: embedConfig.dashboardUuids,
            allowAllCharts: embedConfig.allowAllCharts,
            chartUuids: embedConfig.chartUuids,
        },
    });

    const handleSubmit = form.onSubmit((values) => {
        onSave({
            dashboardUuids: values.dashboardUuids,
            allowAllDashboards: values.allowAllDashboards,
            chartUuids: values.chartUuids,
            allowAllCharts: values.allowAllCharts,
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
                        withinPortal
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
                        withinPortal
                        description="Only these charts will be allowed to be embedded."
                        {...form.getInputProps('chartUuids')}
                    />
                )}
                <Flex justify="flex-end" gap="sm">
                    <Button
                        type="submit"
                        disabled={
                            disabled ||
                            dashboards.length === 0 ||
                            charts.length === 0
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
