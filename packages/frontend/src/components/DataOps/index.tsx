import { ProjectType } from '@lightdash/common';
import { Button, Flex, Text, Title, Select } from '@mantine-8/core';
import { useState, type FC } from 'react';
import { useProject } from '../../hooks/useProject';
import { useProjects } from '../../hooks/useProjects';
import { groupComboboxItems } from '../common/Select/utils';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import { useUpdateMutation } from './hooks/useUpstreamProject';

export const DataOps: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data: projects } = useProjects();
    const { data: currentProject } = useProject(projectUuid);
    const { mutateAsync: updateMutation } = useUpdateMutation(projectUuid);
    const [selectedProject, setSelectedProject] = useState<string | null>(
        currentProject?.upstreamProjectUuid || null,
    );
    return (
        <>
            <Text c="dimmed">
                Perform data operations between on this project
            </Text>

            <SettingsGridCard>
                <div>
                    <Title order={4}>Promote content</Title>
                    <Text c="ldGray.6" fz="xs">
                        Developers and admins on this organization can copy
                        content from this project into the selected upstream
                        project, overriding its defaults or creating new content
                        if it is new.
                    </Text>
                </div>
                <div>
                    <Select
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
                    <Flex justify="flex-end" gap="sm" mt="sm">
                        <Button
                            type="submit"
                            display="block"
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
                            Update
                        </Button>
                    </Flex>
                </div>
            </SettingsGridCard>
        </>
    );
};
