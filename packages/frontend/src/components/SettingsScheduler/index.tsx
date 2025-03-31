import { getErrorMessage, isApiError } from '@lightdash/common';
import { LoadingOverlay, Stack, Title } from '@mantine/core';
import { useCallback, type FC } from 'react';
import type { z } from 'zod';
import useToaster from '../../hooks/toaster/useToaster';
import {
    useProject,
    useProjectUpdateSchedulerSettings,
} from '../../hooks/useProject';
import SchedulersView from '../SchedulersView';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import SchedulerSettingsForm from './schedulerSettingsForm';
import { type schedulerSettingsSchema } from './types';

type SettingsSchedulerProps = {
    projectUuid: string;
};

const SettingsScheduler: FC<SettingsSchedulerProps> = ({ projectUuid }) => {
    const { showToastError, showToastSuccess } = useToaster();
    const { data: project, isLoading: isLoadingProject } =
        useProject(projectUuid);

    const projectMutation = useProjectUpdateSchedulerSettings(projectUuid);

    const handleSubmit = useCallback(
        async (schedulerSettings: z.infer<typeof schedulerSettingsSchema>) => {
            const { timezone } = schedulerSettings;
            try {
                await projectMutation.mutateAsync({
                    schedulerTimezone: timezone,
                });

                showToastSuccess({
                    title: `Successfully updated project's scheduler timezone settings`,
                });
            } catch (e) {
                const errorMessage = isApiError(e)
                    ? e.error.message
                    : getErrorMessage(e);
                showToastError({
                    title: `Failed to update project's scheduler timezone settings`,
                    subtitle: errorMessage,
                });
            }

            return false;
        },
        [projectMutation, showToastError, showToastSuccess],
    );

    return (
        <>
            <LoadingOverlay visible={isLoadingProject} />
            <SettingsGridCard>
                <Stack spacing="sm">
                    <Title order={4}>Scheduled deliveries settings</Title>
                </Stack>

                <SchedulerSettingsForm
                    isLoading={false}
                    project={project}
                    onSubmit={handleSubmit}
                />
            </SettingsGridCard>
            <SchedulersView projectUuid={projectUuid} />
        </>
    );
};

export default SettingsScheduler;
