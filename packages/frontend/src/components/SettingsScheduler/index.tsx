import {
    getErrorMessage,
    isApiError,
    type UpdateSchedulerSettings,
} from '@lightdash/common';
import { LoadingOverlay } from '@mantine/core';
import { useCallback, type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import {
    useProject,
    useProjectUpdateSchedulerSettings,
} from '../../hooks/useProject';
import { SettingsSection } from '../common/Settings/SettingLayout';
import { SettingsCard } from '../common/Settings/SettingsCard';
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
        <>
            <SettingsSection
                label="Delivery defaults"
                description="Applied to all of this project's scheduled deliveries. Owners can override these per delivery when creating or editing a scheduler."
            >
                <SettingsCard pos="relative">
                    <LoadingOverlay visible={isLoadingProject} />
                    <SchedulerSettingsForm
                        project={project}
                        onChange={handleChange}
                    />
                </SettingsCard>
            </SettingsSection>

            <SettingsSection label="Deliveries" description={null}>
                <SchedulersView projectUuid={projectUuid} />
            </SettingsSection>
        </>
    );
};

export default SettingsScheduler;
