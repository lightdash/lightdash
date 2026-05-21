import {
    getErrorMessage,
    isApiError,
    type UpdateSchedulerSettings,
} from '@lightdash/common';
import { Box, LoadingOverlay, Stack, Text, Title } from '@mantine-8/core';
import { useCallback, type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import {
    useProject,
    useProjectUpdateSchedulerSettings,
} from '../../hooks/useProject';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import SchedulersView from '../SchedulersView';
import { SchedulerSettingsForm } from './SchedulerSettingsForm';

type SettingsSchedulerProps = {
    projectUuid: string;
};

const FIELD_LABELS: Record<keyof UpdateSchedulerSettings, string> = {
    schedulerTimezone: 'Default time zone',
    schedulerFailureNotifyRecipients: 'Notify recipients if a delivery fails',
    schedulerFailureIncludeContact: 'Include a contact in failure messages',
    schedulerFailureContactOverride: 'Custom contact sentence',
};

const summarizeChange = (changes: UpdateSchedulerSettings): string => {
    const changedKeys = (
        Object.keys(changes) as (keyof UpdateSchedulerSettings)[]
    ).filter((k) => changes[k] !== undefined);
    if (changedKeys.length === 1) {
        return `${FIELD_LABELS[changedKeys[0]]} updated`;
    }
    return 'Scheduled delivery settings updated';
};

const SettingsScheduler: FC<SettingsSchedulerProps> = ({ projectUuid }) => {
    const { showToastError, showToastSuccess } = useToaster();
    const { data: project, isLoading: isLoadingProject } =
        useProject(projectUuid);

    const projectMutation = useProjectUpdateSchedulerSettings(projectUuid);

    const handleChange = useCallback(
        async (changes: UpdateSchedulerSettings) => {
            try {
                await projectMutation.mutateAsync(changes);
                showToastSuccess({ title: summarizeChange(changes) });
            } catch (e) {
                const errorMessage = isApiError(e)
                    ? e.error.message
                    : getErrorMessage(e);
                showToastError({
                    title: `Failed to update project's scheduled delivery settings`,
                    subtitle: errorMessage,
                });
            }
        },
        [projectMutation, showToastError, showToastSuccess],
    );

    return (
        <Stack gap="sm" pos="relative">
            <LoadingOverlay visible={isLoadingProject} />
            <SettingsGridCard>
                <Stack gap="xs">
                    <Title order={4}>Settings</Title>
                    <Text c="ldGray.6" fz="sm">
                        Default settings applied to all of this project's
                        scheduled deliveries. Owners can override these
                        per-delivery when creating or editing a scheduler.
                    </Text>
                </Stack>
                <Box>
                    <SchedulerSettingsForm
                        project={project}
                        onChange={handleChange}
                    />
                </Box>
            </SettingsGridCard>

            <SchedulersView projectUuid={projectUuid} />
        </Stack>
    );
};

export default SettingsScheduler;
