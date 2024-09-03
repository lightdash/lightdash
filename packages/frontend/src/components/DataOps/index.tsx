import { ProjectType } from '@lightdash/common';
import { Button, Flex, Select, Text, Title } from '@mantine/core';
import { useState, type FC } from 'react';
import { useProject } from '../../hooks/useProject';
import { useProjects } from '../../hooks/useProjects';
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
            <Text color="dimmed">
                Perform data operations between on this project
            </Text>

            <SettingsGridCard>
                <div>
                    <Title order={4}>Promote content</Title>
                    <Text c="gray.6" fz="xs">
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
                        data={
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
                                    label: project.name,
                                    value: project.projectUuid,
                                    disabled:
                                        project.projectUuid === projectUuid,
                                    selected:
                                        project.projectUuid ===
                                        currentProject?.upstreamProjectUuid,
                                    group:
                                        project.type === ProjectType.PREVIEW
                                            ? 'Preview projects'
                                            : 'Production projects',
                                })) || []
                        }
                        label="Upstream project"
                        onChange={(value) => {
                            setSelectedProject(value || null);
                        }}
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
