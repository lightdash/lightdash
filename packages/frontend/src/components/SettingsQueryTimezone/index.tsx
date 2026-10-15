import {
    FeatureFlags,
    getErrorMessage,
    isApiError,
    type Project,
} from '@lightdash/common';
import {
    Button,
    Flex,
    LoadingOverlay,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import useToaster from '../../hooks/toaster/useToaster';
import {
    useProject,
    useProjectUpdateQueryTimezoneSettings,
} from '../../hooks/useProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import TimeZonePicker from '../common/TimeZonePicker';

const queryTimezoneSchema = z.object({
    timezone: z.string().nullable(),
    useProjectTimezoneInFilters: z.boolean(),
});

type QueryTimezoneFormValues = z.infer<typeof queryTimezoneSchema>;

const QueryTimezoneForm: FC<{
    isLoading: boolean;
    project: Project;
    showFilterInputsToggle: boolean;
    onSubmit: (data: QueryTimezoneFormValues) => void;
}> = ({ isLoading, project, showFilterInputsToggle, onSubmit }) => {
    const { t } = useTranslation('projectSettings');
    const form = useForm<QueryTimezoneFormValues>({
        validate: zodResolver(queryTimezoneSchema),
        initialValues: {
            timezone: project.queryTimezone ?? null,
            useProjectTimezoneInFilters: project.useProjectTimezoneInFilters,
        },
    });

    const hasChanged = useMemo(
        () =>
            form.values.timezone !== (project.queryTimezone ?? null) ||
            form.values.useProjectTimezoneInFilters !==
                project.useProjectTimezoneInFilters,
        [
            form.values.timezone,
            form.values.useProjectTimezoneInFilters,
            project.queryTimezone,
            project.useProjectTimezoneInFilters,
        ],
    );

    const filterToggleDisabled = !form.values.timezone;

    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Stack gap="md">
                <TimeZonePicker
                    label={t('queryTimezone.form.timezoneLabel')}
                    variant="default"
                    maw="100%"
                    searchable
                    clearable
                    placeholder={t('queryTimezone.form.timezonePlaceholder')}
                    {...form.getInputProps('timezone')}
                />
                {showFilterInputsToggle && (
                    <Switch
                        label={t('queryTimezone.form.filterInputs.label')}
                        description={t(
                            'queryTimezone.form.filterInputs.description',
                        )}
                        disabled={filterToggleDisabled}
                        {...form.getInputProps('useProjectTimezoneInFilters', {
                            type: 'checkbox',
                        })}
                    />
                )}
            </Stack>
            <Flex justify="flex-end" gap="sm" mt="sm">
                <Button
                    type="submit"
                    disabled={!form.isValid() || !hasChanged}
                    loading={isLoading}
                >
                    {t('actions.update', { ns: 'common' })}
                </Button>
            </Flex>
        </form>
    );
};

type SettingsQueryTimezoneProps = {
    projectUuid: string;
};

const SettingsQueryTimezone: FC<SettingsQueryTimezoneProps> = ({
    projectUuid,
}) => {
    const { t } = useTranslation('projectSettings');
    const { showToastError, showToastSuccess } = useToaster();
    const { data: timezoneSupportFlag } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
    );
    const timezoneSupportEnabled = timezoneSupportFlag?.enabled === true;
    const { data: project, isLoading: isLoadingProject } =
        useProject(projectUuid);
    const projectMutation = useProjectUpdateQueryTimezoneSettings(projectUuid);

    const handleSubmit = useCallback(
        async (values: QueryTimezoneFormValues) => {
            const queryTimezone = values.timezone ?? null;
            try {
                await projectMutation.mutateAsync({
                    queryTimezone,
                    useProjectTimezoneInFilters:
                        queryTimezone !== null &&
                        values.useProjectTimezoneInFilters,
                });
                showToastSuccess({
                    title: t('queryTimezone.toast.updateSuccess'),
                });
            } catch (e) {
                const errorMessage = isApiError(e)
                    ? e.error.message
                    : getErrorMessage(e);
                showToastError({
                    title: t('queryTimezone.toast.updateFailed'),
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
                    <Title order={5}>{t('queryTimezone.title')}</Title>
                    <Text c="dimmed" fz="sm">
                        {timezoneSupportEnabled
                            ? t('queryTimezone.description.timezoneSupport')
                            : t('queryTimezone.description.legacy')}
                    </Text>
                </Stack>
                <div>
                    {project && (
                        <QueryTimezoneForm
                            isLoading={projectMutation.isLoading}
                            project={project}
                            showFilterInputsToggle={timezoneSupportEnabled}
                            onSubmit={handleSubmit}
                        />
                    )}
                </div>
            </SettingsGridCard>
        </Stack>
    );
};

export default SettingsQueryTimezone;
