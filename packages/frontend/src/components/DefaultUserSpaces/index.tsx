import { Switch, Text, Title } from '@mantine-8/core';
import { type FC } from 'react';
import { useProject, useUpdateDefaultUserSpaces } from '../../hooks/useProject';
import { SettingsGridCard } from '../common/Settings/SettingsCard';

export const DefaultUserSpaces: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { data: project } = useProject(projectUuid);
    const { mutate, isLoading } = useUpdateDefaultUserSpaces(projectUuid);

    return (
        <>
            <Text c="dimmed">
                Manage default personal spaces for project members
            </Text>

            <SettingsGridCard>
                <div>
                    <Title order={4}>Default user spaces</Title>
                    <Text c="ldGray.6" fz="xs">
                        When enabled, each project member will automatically get
                        a personal space where they can save their own charts
                        and dashboards.
                    </Text>
                </div>
                <div>
                    <Switch
                        label="Enable default user spaces"
                        checked={project?.hasDefaultUserSpaces ?? false}
                        disabled={isLoading}
                        onChange={(event) => {
                            mutate({
                                hasDefaultUserSpaces:
                                    event.currentTarget.checked,
                            });
                        }}
                    />
                </div>
            </SettingsGridCard>
        </>
    );
};
