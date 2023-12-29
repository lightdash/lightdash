import { ProjectType } from '@lightdash/common';
import { Select } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { useHistory, useRouteMatch } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import {
    useActiveProjectUuid,
    useUpdateActiveProjectMutation,
} from '../../hooks/useActiveProject';
import { useProjects } from '../../hooks/useProjects';

const swappableProjectRoutes = (activeProjectUuid: string) => [
    `/projects/${activeProjectUuid}/home`,
    `/projects/${activeProjectUuid}/saved`,
    `/projects/${activeProjectUuid}/dashboards`,
    `/projects/${activeProjectUuid}/spaces`,
    `/projects/${activeProjectUuid}/sqlRunner`,
    `/projects/${activeProjectUuid}/tables`,
    `/projects/${activeProjectUuid}/user-activity`,
    `/projects/${activeProjectUuid}`,
    `/generalSettings`,
    `/generalSettings/password`,
    `/generalSettings/personalAccessTokens`,
    `/generalSettings/organization`,
    `/generalSettings/userManagement`,
    `/generalSettings/appearance`,
    `/generalSettings/projectManagement`,
    `/generalSettings/projectManagement/${activeProjectUuid}/settings`,
    `/generalSettings/projectManagement/${activeProjectUuid}/tablesConfiguration`,
    `/generalSettings/projectManagement/${activeProjectUuid}/projectAccess`,
    `/generalSettings/projectManagement/${activeProjectUuid}/integrations/dbtCloud`,
    `/generalSettings/projectManagement/${activeProjectUuid}/usageAnalytics`,
    `/generalSettings/projectManagement/${activeProjectUuid}/scheduledDeliveries`,
    `/generalSettings/projectManagement/${activeProjectUuid}/validator`,
    `/generalSettings/projectManagement/${activeProjectUuid}`,
];

const ProjectSwitcher = () => {
    const { showToastSuccess } = useToaster();
    const history = useHistory();

    const { isInitialLoading: isLoadingProjects, data: projects } =
        useProjects();
    const { isLoading: isLoadingActiveProjectUuid, activeProjectUuid } =
        useActiveProjectUuid();
    const { mutate: setLastProjectMutation } = useUpdateActiveProjectMutation();

    const isHomePage = !!useRouteMatch({
        path: '/projects/:projectUuid/home',
        exact: true,
    });

    const swappableRouteMatch = useRouteMatch(
        activeProjectUuid
            ? { path: swappableProjectRoutes(activeProjectUuid), exact: true }
            : [],
    );

    const shouldSwapProjectRoute = !!swappableRouteMatch && activeProjectUuid;

    if (
        isLoadingProjects ||
        isLoadingActiveProjectUuid ||
        !projects ||
        projects.length === 0
    ) {
        return null;
    }

    const handleProjectChange = (newUuid: string) => {
        if (!newUuid) return;

        const project = projects?.find((p) => p.projectUuid === newUuid);
        if (!project) return;

        setLastProjectMutation(project.projectUuid);

        showToastSuccess({
            title: `You are now viewing ${project.name}`,
            action:
                !isHomePage && shouldSwapProjectRoute
                    ? {
                          children: 'Go to project home',
                          icon: IconArrowRight,
                          onClick: () => {
                              history.push(
                                  `/projects/${project.projectUuid}/home`,
                              );
                          },
                      }
                    : undefined,
        });

        if (shouldSwapProjectRoute) {
            history.push(
                swappableRouteMatch.path.replace(
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
            dropdownComponent="div"
            styles={{
                item: {
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                },
            }}
            disabled={isLoadingProjects || isLoadingActiveProjectUuid}
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
