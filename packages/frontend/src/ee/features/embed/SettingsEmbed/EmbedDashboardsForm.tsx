import {
    type DashboardBasicDetails,
    type DecodedEmbed,
    type UpdateEmbed,
} from '@lightdash/common';
import { Button, Flex, MultiSelect, Stack, Switch } from '@mantine/core';
import { useForm } from '@mantine/form';
import React, { type FC } from 'react';

const EmbedDashboardsForm: FC<{
    disabled: boolean;
    embedConfig: DecodedEmbed;
    dashboards: DashboardBasicDetails[];
    onSave: (values: UpdateEmbed) => void;
}> = ({ disabled, embedConfig, dashboards, onSave }) => {
    const form = useForm({
        initialValues: {
            allowAllDashboards: embedConfig.allowAllDashboards,
            dashboardUuids: embedConfig.dashboardUuids,
        },
    });

    const handleSubmit = form.onSubmit((values) => {
        onSave({
            dashboardUuids: values.dashboardUuids,
            allowAllDashboards: values.allowAllDashboards,
            chartUuids: [],
            allowAllCharts: false,
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
                <Flex justify="flex-end" gap="sm">
                    <Button
                        type="submit"
                        disabled={disabled || dashboards.length === 0}
                    >
                        Save changes
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default EmbedDashboardsForm;
