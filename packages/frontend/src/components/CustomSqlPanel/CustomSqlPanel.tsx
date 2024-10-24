import { FeatureFlags, type ApiError } from '@lightdash/common';
import { Button, Group, Title, Tooltip } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import React, { type FC } from 'react';
import { lightdashApi } from '../../api';
import { useFeatureFlagEnabled } from '../../hooks/useFeatureFlagEnabled';
import LoadingState from '../common/LoadingState';
import ResourceEmptyState from '../common/ResourceView/ResourceEmptyState';
import { SettingsCard } from '../common/Settings/SettingsCard';
import { CreateCustomMetricsPullRequestModal } from './CreateCustomMetricsPullRequestModal';
import CustomMetricsTable, {
    type CustomMetricData,
} from './CustomMetricsTable';

const getCustomMetrics = async (projectUuid: string) => {
    return lightdashApi<CustomMetricData[]>({
        url: `/projects/${projectUuid}/custom-metrics`,
        method: 'GET',
        body: undefined,
    });
};

const useCustomMetrics = (projectUuid: string) =>
    useQuery<CustomMetricData[], ApiError>({
        queryKey: ['custom-metrics', projectUuid],
        queryFn: () => getCustomMetrics(projectUuid),
        refetchOnMount: 'always',
    });

const CustomSqlPanel: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const [isOpen, setOpen] = React.useState(false);
    const [checked, setChecked] = React.useState<string[]>([]);
    const { data, isInitialLoading } = useCustomMetrics(projectUuid);

    const isCustomSQLEnabled = useFeatureFlagEnabled(
        FeatureFlags.CustomSQLEnabled,
    );

    if (!isCustomSQLEnabled) {
        return null;
    }

    if (isInitialLoading) {
        return <LoadingState title="Loading custom SQL" />;
    }
    // todo: disable button if no custom metrics are selected Or if gitintegration is not enabled
    return (
        <SettingsCard style={{ overflow: 'visible' }} p={0} shadow="none">
            <Group
                align="center"
                p="md"
                spacing="xs"
                sx={{
                    flexGrow: 1,
                }}
            >
                <Title order={5}>Custom SQL</Title>
                <Tooltip label="Click to refresh the status of the scheduled deliveries">
                    <Button size="xs" onClick={() => setOpen(true)} ml="auto">
                        Create pull request
                    </Button>
                </Tooltip>
            </Group>
            {data && data.length > 0 ? (
                <CustomMetricsTable
                    customMetrics={data}
                    onSelectedCustomMetricsChange={(data2) => setChecked(data2)}
                />
            ) : (
                <ResourceEmptyState title="No custom metrics on this project" />
            )}

            {isOpen && (
                <CreateCustomMetricsPullRequestModal
                    opened={isOpen}
                    onClose={() => setOpen(false)}
                    projectUuid={projectUuid}
                    customMetrics={checked}
                />
            )}
        </SettingsCard>
    );
};

export default CustomSqlPanel;
