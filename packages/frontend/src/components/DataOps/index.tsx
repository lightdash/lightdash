import { ProjectType } from '@lightdash/common';
import { Button, Group, Select, Stack } from '@mantine/core';
import { useState, type FC } from 'react';
import { useProject } from '../../hooks/useProject';
import { useProjects } from '../../hooks/useProjects';
import { groupComboboxItems } from '../common/Select/utils';
import { SettingRow } from '../common/Settings/SettingLayout';
import { SettingsCard } from '../common/Settings/SettingsCard';
import { useUpdateMutation } from './hooks/useUpstreamProject';

export const DataOps: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data: projects } = useProjects();
    const { data: currentProject } = useProject(projectUuid);
    const { mutateAsync: updateMutation } = useUpdateMutation(projectUuid);
    const [selectedProject, setSelectedProject] = useState<string | null>(
        currentProject?.upstreamProjectUuid || null,
    );
    return (
        <SettingsCard>
            <Stack gap="md">
                <SettingRow
                    title="Promote content"
                    description="Developers and admins on this organization can copy content from this project into the selected upstream project, overriding its defaults or creating new content if it is new."
                >
                    <Select
                        mt="sm"
                        value={selectedProject}
                        clearable
                        data={groupComboboxItems(
                            projects
                                ?.sort((a, b) => {
                                    if (a.type === b.type) {
                                        return 0;
                                    }
                                    return a.type === ProjectType.PREVIEW
                                        ? 1
                                        : -1;
                                })
                                .map((project) => ({
                                    label:
                                        project.projectUuid === projectUuid
                                            ? `${project.name} (Current)`
                                            : project.name,
                                    value: project.projectUuid,
                                    disabled:
                                        project.projectUuid === projectUuid,
                                    group:
                                        project.type === ProjectType.PREVIEW
                                            ? 'Preview projects'
                                            : 'Production projects',
                                })) || [],
                        )}
                        label="Upstream project"
                        onChange={(value) => {
                            setSelectedProject(value || null);
                        }}
                        placeholder="Select project"
                    />
                </SettingRow>
                <Group justify="flex-end">
                    <Button
                        disabled={
                            selectedProject ===
                            currentProject?.upstreamProjectUuid
                        }
                        onClick={async () => {
                            await updateMutation({
                                upstreamProjectUuid: selectedProject,
                            });
                        }}
                    >
                        Save
                    </Button>
                </Group>
            </Stack>
        </SettingsCard>
    );
};
