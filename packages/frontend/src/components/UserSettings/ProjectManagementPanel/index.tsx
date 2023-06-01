import { subject } from '@casl/ability';
import { OrganizationProject, ProjectType } from '@lightdash/common';
import { Badge, Button, Group, Stack, Table, Text, Title } from '@mantine/core';
import { IconSettings, IconTrash } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { Link, Redirect } from 'react-router-dom';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import {
    useActiveProject,
    useUpdateActiveProjectMutation,
} from '../../../hooks/useActiveProject';
import { useProjects } from '../../../hooks/useProjects';
import { useApp } from '../../../providers/AppProvider';
import { Can } from '../../common/Authorization';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { ProjectDeleteModal } from '../DeleteProjectPanel/DeleteProjectModal';

const ProjectListItem: FC<{
    isCurrentProject: boolean;
    project: OrganizationProject;
}> = ({ isCurrentProject, project: { projectUuid, name, type } }) => {
    const { user } = useApp();
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const { mutate: setLastProjectMutation } = useUpdateActiveProjectMutation();

    return (
        <tr>
            <Text component="td" fw={500}>
                {name}
            </Text>

            <td>
                {isCurrentProject && (
                    <Badge variant="filled">Current Project</Badge>
                )}
                {type === ProjectType.PREVIEW && <Badge>Preview</Badge>}
            </td>

            <td width="1%">
                <Group noWrap position="right" spacing="sm">
                    <Button
                        component={Link}
                        size="xs"
                        to={`/generalSettings/projectManagement/${projectUuid}`}
                        leftIcon={<MantineIcon icon={IconSettings} />}
                        variant="outline"
                        onClick={() => {
                            setLastProjectMutation(projectUuid);
                        }}
                    >
                        Settings
                    </Button>

                    <Can
                        I="delete"
                        this={subject('Project', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        <Button
                            leftIcon={<MantineIcon icon={IconTrash} />}
                            size="xs"
                            variant="outline"
                            color="red"
                            onClick={() => setIsDeleteDialogOpen(true)}
                        >
                            Delete
                        </Button>
                    </Can>
                </Group>
            </td>

            <ProjectDeleteModal
                opened={isDeleteDialogOpen}
                onClose={() => setIsDeleteDialogOpen(false)}
                isCurrentProject={isCurrentProject}
                projectUuid={projectUuid}
            />
        </tr>
    );
};

const ProjectManagementPanel: FC = () => {
    const { data: projects = [], isLoading: isLoadingProjects } = useProjects();
    const { data: lastProjectUuid, isLoading: isLoadingLastProject } =
        useActiveProject();

    const { classes } = useTableStyles();

    if (isLoadingProjects || isLoadingLastProject) return null;

    if (projects.length === 0) {
        return <Redirect to="/createProject" />;
    }

    const lastProject = projects.find(
        (project) => project.projectUuid === lastProjectUuid,
    );

    return (
        <Stack mb="lg">
            <Group position="apart">
                <Title order={5}>Project management settings</Title>

                <Can I="create" a="Project">
                    <Button component={Link} to="/createProject">
                        Create new
                    </Button>
                </Can>
            </Group>

            <SettingsCard sx={{ overflow: 'hidden' }} shadow="none" p={0}>
                <Table className={classes.root}>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th></th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {projects.map((project) => (
                            <ProjectListItem
                                key={project.projectUuid}
                                isCurrentProject={
                                    lastProject?.projectUuid ===
                                    project.projectUuid
                                }
                                project={project}
                            />
                        ))}
                    </tbody>
                </Table>
            </SettingsCard>
        </Stack>
    );
};

export default ProjectManagementPanel;
