import {
    getErrorMessage,
    isApiError,
    type UpdateSchedulerSettings,
} from '@lightdash/common';
import { Box, LoadingOverlay, Stack, Text, Title } from '@mantine/core';
import { type TFunction } from 'i18next';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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

const summarizeChange = (
    changes: UpdateSchedulerSettings,
    t: TFunction<'projectSettings'>,
): string => {
    const changedKeys = (
        Object.keys(changes) as (keyof UpdateSchedulerSettings)[]
    ).filter((k) => changes[k] !== undefined);
    if (changedKeys.length === 1) {
        return t(`scheduler.toast.fieldUpdated.${changedKeys[0]}`);
    }
    return t('scheduler.toast.settingsUpdated');
};

const SettingsScheduler: FC<SettingsSchedulerProps> = ({ projectUuid }) => {
    const { t } = useTranslation('projectSettings');
    const { showToastError, showToastSuccess } = useToaster();
    const { data: project, isLoading: isLoadingProject } =
        useProject(projectUuid);

    const projectMutation = useProjectUpdateSchedulerSettings(projectUuid);

    const handleChange = useCallback(
        async (changes: UpdateSchedulerSettings) => {
            try {
                await projectMutation.mutateAsync(changes);
                showToastSuccess({ title: summarizeChange(changes, t) });
            } catch (e) {
                const errorMessage = isApiError(e)
                    ? e.error.message
                    : getErrorMessage(e);
                showToastError({
                    title: t('scheduler.toast.updateFailed'),
                    subtitle: errorMessage,
                });
            }
        },
        [projectMutation, showToastError, showToastSuccess, t],
    );

    return (
        <Stack gap="sm" pos="relative">
            <LoadingOverlay visible={isLoadingProject} />
            <SettingsGridCard>
                <Stack gap="xs">
                    <Title order={5}>
                        {t('scheduler.deliveryDefaults.title')}
                    </Title>
                    <Text c="dimmed" fz="sm">
                        {t('scheduler.deliveryDefaults.description')}
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
