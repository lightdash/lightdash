import { type DashboardBasicDetails } from '@lightdash/common';
import { Button, Flex, MultiSelect, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import React, { type FC } from 'react';

const EmbedDashboardsForm: FC<{
    disabled: boolean;
    selectedDashboardsUuids: string[];
    dashboards: DashboardBasicDetails[];
    onSave: (dashboardUuids: string[]) => void;
}> = ({ disabled, selectedDashboardsUuids, dashboards, onSave }) => {
    const form = useForm({
        initialValues: {
            dashboardUuids: selectedDashboardsUuids,
        },
    });

    const handleSubmit = form.onSubmit((values) => {
        if (values.dashboardUuids.length > 0) {
            onSave(values.dashboardUuids);
        }
    });

    return (
        <form id="add-dashboard-to-embed-config" onSubmit={handleSubmit}>
            <Stack>
                <MultiSelect
                    required
                    label={'Dashboards'}
                    data={dashboards.map((dashboard) => ({
                        value: dashboard.uuid,
                        label: dashboard.name,
                    }))}
                    disabled={disabled}
                    defaultValue={[]}
                    placeholder="Select a dashboard..."
                    searchable
                    withinPortal
                    {...form.getInputProps('dashboardUuids')}
                />
                <Flex justify="flex-end" gap="sm">
                    <Button type="submit" disabled={disabled}>
                        Save changes
                    </Button>
                </Flex>
            </Stack>
        </form>
    );
};

export default EmbedDashboardsForm;
