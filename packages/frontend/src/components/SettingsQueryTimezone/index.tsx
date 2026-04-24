import {
    FeatureFlags,
    getErrorMessage,
    isApiError,
    type Project,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Flex,
    LoadingOverlay,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { useCallback, useMemo, type FC } from 'react';
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
});

type QueryTimezoneFormValues = z.infer<typeof queryTimezoneSchema>;

const QueryTimezoneForm: FC<{
    isLoading: boolean;
    project: Project;
    onSubmit: (data: QueryTimezoneFormValues) => void;
}> = ({ isLoading, project, onSubmit }) => {
    const form = useForm<QueryTimezoneFormValues>({
        validate: zodResolver(queryTimezoneSchema),
        initialValues: {
            timezone: project.queryTimezone ?? null,
        },
    });

    const hasChanged = useMemo(
        () => form.values.timezone !== (project.queryTimezone ?? null),
        [form.values.timezone, project.queryTimezone],
    );

    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <TimeZonePicker
                label="Default query time zone"
                variant="default"
                maw="100%"
                searchable
                clearable
                placeholder="Server default (UTC)"
                {...form.getInputProps('timezone')}
            />
            <Flex justify="flex-end" gap="sm" mt="sm">
                <Button
                    type="submit"
                    disabled={!form.isValid() || !hasChanged}
                    loading={isLoading}
                >
                    Update
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
            try {
                await projectMutation.mutateAsync({
                    queryTimezone: values.timezone ?? null,
                });
                showToastSuccess({
                    title: `Successfully updated project's query timezone`,
                });
            } catch (e) {
                const errorMessage = isApiError(e)
                    ? e.error.message
                    : getErrorMessage(e);
                showToastError({
                    title: `Failed to update project's query timezone`,
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
                    <Title order={4}>Query time zone</Title>
                    <Text c="ldGray.6" fz="sm">
                        {timezoneSupportEnabled ? (
                            <>
                                The time zone used for date filters, time
                                grouping, and how dates appear in charts and
                                tables. This does not change your
                                database&apos;s session time zone.
                            </>
                        ) : (
                            <>
                                Controls what &quot;today&quot;, &quot;this
                                week&quot;, and other &quot;in the current&quot;
                                date filters mean. For example, if set to
                                US/Eastern, &quot;today&quot; means
                                midnight-to-midnight New York time instead of
                                UTC. This does not change your database&apos;s
                                session time zone.
                            </>
                        )}
                    </Text>
                    <Text c="ldGray.6" fz="xs">
                        Learn more in our{' '}
                        <Anchor
                            href="https://docs.lightdash.com/guides/developer/timezones"
                            target="_blank"
                            fz="xs"
                        >
                            docs guide
                        </Anchor>
                        .
                    </Text>
                </Stack>
                <div>
                    {project && (
                        <QueryTimezoneForm
                            isLoading={projectMutation.isLoading}
                            project={project}
                            onSubmit={handleSubmit}
                        />
                    )}
                </div>
            </SettingsGridCard>
        </Stack>
    );
};

export default SettingsQueryTimezone;
