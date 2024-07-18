import { ProjectType, type OrganizationProject } from '@lightdash/common';
import { Badge, Button, Group, Menu, Text, Tooltip } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useHistory, useRouteMatch } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import {
    useActiveProjectUuid,
    useUpdateActiveProjectMutation,
} from '../../hooks/useActiveProject';
import { useIsTruncated } from '../../hooks/useIsTruncated';
import { useProjects } from '../../hooks/useProjects';

const InactiveProjectItem: FC<{
    item: OrganizationProject;
    handleProjectChange: (newUuid: string) => void;
}> = ({ item, handleProjectChange }) => {
    const { ref: truncatedRef, isTruncated } = useIsTruncated<HTMLDivElement>();
    return (
        <Menu.Item
            key={item.projectUuid}
            onClick={() => handleProjectChange(item.projectUuid)}
        >
            <Group spacing="sm" position="apart" noWrap>
                <Tooltip
                    withinPortal
                    variant="xs"
                    label={item.name}
                    maw={300}
                    disabled={!isTruncated}
                    color="dark"
                    multiline
                >
                    <Text
                        ref={truncatedRef}
                        c="gray.2"
                        fz="xs"
                        fw={500}
                        truncate
                        maw={350}
                    >
                        {item.name}
                    </Text>
                </Tooltip>
                {item.type === ProjectType.PREVIEW && (
                    <Badge
                        color="yellow.1"
                        variant="light"
                        size="xs"
                        radius="sm"
                        fw={400}
                        sx={{
                            textTransform: 'none',
                        }}
                    >
                        Preview
                    </Badge>
                )}
            </Group>
        </Menu.Item>
    );
};

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
    `/generalSettings/myWarehouseConnections`,
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

    const handleProjectChange = useCallback(
        (newUuid: string) => {
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
        },
        [
            activeProjectUuid,
            history,
            isHomePage,
            projects,
            setLastProjectMutation,
            shouldSwapProjectRoute,
            showToastSuccess,
            swappableRouteMatch,
        ],
    );

    const activeProject = useMemo(() => {
        if (!activeProjectUuid || !projects) return null;
        return projects.find((p) => p.projectUuid === activeProjectUuid);
    }, [activeProjectUuid, projects]);

    const inactiveProjects = useMemo(() => {
        if (!activeProjectUuid || !projects) return [];
        return projects.filter((p) => p.projectUuid !== activeProjectUuid);
    }, [activeProjectUuid, projects]);

    if (
        isLoadingProjects ||
        isLoadingActiveProjectUuid ||
        !projects ||
        projects.length === 0
    ) {
        return null;
    }

    const hasMultipleProjects = projects.length > 1;

    return (
        <Menu
            position="bottom-end"
            withArrow
            shadow="lg"
            arrowOffset={16}
            offset={-2}
            disabled={!hasMultipleProjects}
            styles={{
                dropdown: {
                    maxHeight: 450,
                    overflow: 'auto',
                },
            }}
        >
            <Menu.Target>
                <Button
                    maw={200}
                    variant="default"
                    size="xs"
                    disabled={
                        isLoadingProjects ||
                        isLoadingActiveProjectUuid ||
                        !hasMultipleProjects
                    }
                    sx={(theme) => ({
                        '&:disabled': {
                            color: theme.white,
                            backgroundColor: theme.colors.dark[6],
                            borderColor: theme.colors.dark[4],
                        },
                    })}
                >
                    <Text truncate>
                        {activeProject?.name ?? 'Select a project'}
                    </Text>
                </Button>
            </Menu.Target>

            <Menu.Dropdown maw={400}>
                {inactiveProjects.map((item) => (
                    <InactiveProjectItem
                        key={item.projectUuid}
                        item={item}
                        handleProjectChange={handleProjectChange}
                    />
                ))}
            </Menu.Dropdown>
        </Menu>
    );
};

export default ProjectSwitcher;
