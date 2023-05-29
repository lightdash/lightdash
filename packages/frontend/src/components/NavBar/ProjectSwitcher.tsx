import { ProjectType } from '@lightdash/common';
import { Select } from '@mantine/core';
import { useQueryClient } from 'react-query';
import { useHistory, useRouteMatch } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import { useActiveProjectUuid } from '../../hooks/useProject';
import {
    useProjects,
    useUpdateActiveProjectMutation,
} from '../../hooks/useProjects';

const routesToReplace = (activeProjectUuid: string) => [
    `/projects/${activeProjectUuid}/home`,
    `/projects/${activeProjectUuid}/saved`,
    `/projects/${activeProjectUuid}/dashboards`,
    `/projects/${activeProjectUuid}/spaces`,
    `/projects/${activeProjectUuid}/sqlRunner`,
    `/projects/${activeProjectUuid}/tables`,
    `/projects/${activeProjectUuid}/user-activity`,
    `/projects/${activeProjectUuid}`,
    `/generalSettings/projectManagement/${activeProjectUuid}/settings`,
    `/generalSettings/projectManagement/${activeProjectUuid}/tablesConfiguration`,
    `/generalSettings/projectManagement/${activeProjectUuid}/projectAccess`,
    `/generalSettings/projectManagement/${activeProjectUuid}/integrations/dbt-cloud`,
    `/generalSettings/projectManagement/${activeProjectUuid}/usageAnalytics`,
    `/generalSettings/projectManagement/${activeProjectUuid}/scheduledDeliveries`,
    `/generalSettings/projectManagement/${activeProjectUuid}`,
];

const ProjectSwitcher = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess } = useToaster();
    const history = useHistory();

    const { isLoading: isLoadingProjects, data: projects = [] } = useProjects();
    const { isLoading: isLoadingActiveProjectUuid, activeProjectUuid } =
        useActiveProjectUuid();
    const { mutate: setLastProjectMutation } = useUpdateActiveProjectMutation();

    const isHomePage = useRouteMatch({
        path: '/projects/:projectUuid/home',
        exact: true,
    });
    const replaceRouteMatch = useRouteMatch(
        activeProjectUuid
            ? { path: routesToReplace(activeProjectUuid), exact: true }
            : [],
    );

    if (isLoadingProjects || isLoadingActiveProjectUuid) {
        return null;
    }

    const handleProjectChange = (newUuid: string) => {
        if (!newUuid) return;

        const project = projects?.find((p) => p.projectUuid === newUuid);

        if (!project) return;

        queryClient.removeQueries('project');
        queryClient.removeQueries('projects');

        setLastProjectMutation(project.projectUuid);

        showToastSuccess({
            icon: 'tick',
            title: `You are now viewing ${project.name}`,
            action: isHomePage
                ? undefined
                : {
                      text: 'Go to project home',
                      icon: 'arrow-right',
                      onClick: () => {
                          history.push(`/projects/${project.projectUuid}/home`);
                      },
                  },
        });

        if (activeProjectUuid && replaceRouteMatch) {
            history.replace(
                replaceRouteMatch.path.replace(
                    activeProjectUuid,
                    project.projectUuid,
                ),
            );
        } else {
            history.push(`/projects/${project.projectUuid}/home`);
        }
    };

    return (
        <Select
            size="xs"
            w={250}
            disabled={
                isLoadingProjects ||
                isLoadingActiveProjectUuid ||
                projects.length <= 0
            }
            data={projects.map((item) => ({
                value: item.projectUuid,
                label: `${
                    item.type === ProjectType.PREVIEW ? '[Preview] ' : ''
                }${item.name}`,
            }))}
            value={activeProjectUuid}
            onChange={handleProjectChange}
        />
    );
};

export default ProjectSwitcher;
