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

type ProjectListItemProps = {
    isCurrentProject: boolean;
    project: OrganizationProject;
    onDelete: (projectUuid: string) => void;
};

const ProjectListItem: FC<ProjectListItemProps> = ({
    isCurrentProject,
    project: { projectUuid, name, type },
    onDelete,
}) => {
    const { user } = useApp();

    const { mutate: updateActiveProjectMutation } =
        useUpdateActiveProjectMutation();

    return (
        <tr>
            <Text component="td" fw={500}>
                {name}
            </Text>
            <td>
                <Group spacing="xs">
                    {isCurrentProject && (
                        <Badge variant="filled">Current Project</Badge>
                    )}
                    {type === ProjectType.PREVIEW && <Badge>Preview</Badge>}
                </Group>
            </td>
            <td width="1%">
                <Group noWrap position="right" spacing="sm">
                    <Can
                        I="update"
                        this={subject('Project', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        <Button
                            component={Link}
                            size="xs"
                            to={`/generalSettings/projectManagement/${projectUuid}`}
                            leftIcon={<MantineIcon icon={IconSettings} />}
                            variant="outline"
                            onClick={() => {
                                if (!isCurrentProject) {
                                    updateActiveProjectMutation(projectUuid);
                                }
                            }}
                        >
                            Settings
                        </Button>
                    </Can>

                    <Can
                        I="delete"
                        this={subject('Project', {
                            organizationUuid: user.data?.organizationUuid,
                            projectUuid,
                        })}
                    >
                        <Button
                            px="xs"
                            size="xs"
                            variant="outline"
                            color="red"
                            onClick={() => {
                                onDelete(projectUuid);
                            }}
                        >
                            <MantineIcon icon={IconTrash} />
                        </Button>
                    </Can>
                </Group>
            </td>
        </tr>
    );
};

const ProjectManagementPanel: FC = () => {
    const { classes } = useTableStyles();

    const { data: projects = [], isInitialLoading: isLoadingProjects } =
        useProjects();
    const { data: lastProjectUuid, isInitialLoading: isLoadingLastProject } =
        useActiveProject();

    const [deletingProjectUuid, setDeletingProjectUuid] = useState<string>();

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
                                onDelete={(projectUuid) =>
                                    setDeletingProjectUuid(projectUuid)
                                }
                            />
                        ))}
                    </tbody>
                </Table>
            </SettingsCard>

            {deletingProjectUuid ? (
                <ProjectDeleteModal
                    opened={deletingProjectUuid !== undefined}
                    onClose={() => setDeletingProjectUuid(undefined)}
                    isCurrentProject={deletingProjectUuid === lastProjectUuid}
                    projectUuid={deletingProjectUuid}
                />
            ) : null}
        </Stack>
    );
};

export default ProjectManagementPanel;
