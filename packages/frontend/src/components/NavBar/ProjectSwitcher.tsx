import { subject } from '@casl/ability';
import {
    ProjectType,
    assertUnreachable,
    type OrganizationProject,
} from '@lightdash/common';
import { Badge, Box, Button, Group, Menu, Text, Tooltip } from '@mantine/core';
import {
    IconArrowDown,
    IconArrowLeft,
    IconArrowRight,
    IconArrowUp,
    IconArrowsSort,
    IconPlus,
} from '@tabler/icons-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { matchRoutes, useLocation, useMatch, useNavigate } from 'react-router';
import useToaster from '../../hooks/toaster/useToaster';
import {
    useActiveProjectUuid,
    useUpdateActiveProjectMutation,
} from '../../hooks/useActiveProject';
import { useIsTruncated } from '../../hooks/useIsTruncated';
import { useProjects } from '../../hooks/useProjects';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import { CreatePreviewModal } from './CreatePreviewProjectModal';

type SortOption = 'default' | 'alphabetical' | 'type' | 'date';
type SortDirection = 'asc' | 'desc';

type SortOptionConfig = {
    id: SortOption;
    title: string;
    activeLabel: string;
    defaultDirection: SortDirection;
};

type SortConfig = {
    option: SortOption;
    direction: SortDirection;
};

type DropdownView = 'projects' | 'sort';

const LOCAL_STORAGE_KEY = 'project-switcher-sort-preference';

const MENU_TEXT_PROPS = {
    c: 'gray.2',
    fz: 'xs',
    fw: 500,
};

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
                        {...MENU_TEXT_PROPS}
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
    `/generalSettings/scimAccessTokens`,
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
    const navigate = useNavigate();

    const { user } = useApp();

    const { isInitialLoading: isLoadingProjects, data: projects } =
        useProjects();
    const { isLoading: isLoadingActiveProjectUuid, activeProjectUuid } =
        useActiveProjectUuid();
    const { mutate: setLastProjectMutation } = useUpdateActiveProjectMutation();
    const location = useLocation();
    const isHomePage = !!useMatch(`/projects/${activeProjectUuid}/home`);

    const [dropdownView, setDropdownView] = useState<DropdownView>('projects');

    const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
        const savedPreference = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedPreference) {
            try {
                return JSON.parse(savedPreference) as SortConfig;
            } catch (e) {
                localStorage.removeItem(LOCAL_STORAGE_KEY);
            }
        }
        return {
            option: 'default',
            direction: 'desc',
        };
    });

    const sortOptions: SortOptionConfig[] = [
        {
            id: 'alphabetical',
            title: 'Alphabetically',
            activeLabel: 'A-Z',
            defaultDirection: 'asc', // A-Z by default
        },
        {
            id: 'type',
            title: 'By type',
            activeLabel: 'Type',
            defaultDirection: 'asc', // Non-preview first
        },
        {
            id: 'date',
            title: 'By creation date',
            activeLabel: 'Date',
            defaultDirection: 'desc', // Newest first
        },
    ];

    useEffect(() => {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sortConfig));
    }, [sortConfig]);

    const handleSortOptionChange = (option: SortOption) => {
        if (option === sortConfig.option) {
            // Toggle direction if same option is selected
            setSortConfig({
                option,
                direction: sortConfig.direction === 'asc' ? 'desc' : 'asc',
            });
        } else {
            const defaultDirection =
                option === 'default'
                    ? 'desc'
                    : sortOptions.find((opt) => opt.id === option)
                          ?.defaultDirection || 'asc';

            setSortConfig({
                option,
                direction: defaultDirection,
            });
        }

        setDropdownView('projects');
    };

    const toggleSortDirection = () => {
        setSortConfig({
            ...sortConfig,
            direction: sortConfig.direction === 'asc' ? 'desc' : 'asc',
        });

        dropdownView === 'sort' && setDropdownView('projects');
    };

    const toggleDropdownView = () => {
        dropdownView === 'sort'
            ? setDropdownView('projects')
            : setDropdownView('sort');
    };

    const resetSort = () => {
        setSortConfig({
            option: 'default',
            direction: 'desc',
        });

        setDropdownView('projects');
    };

    const routeMatches =
        matchRoutes(
            activeProjectUuid
                ? swappableProjectRoutes(activeProjectUuid).map((path) => ({
                      path,
                  }))
                : [],
            location,
        ) || [];
    const swappableRouteMatch = routeMatches ? routeMatches[0]?.route : null;

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
                                  void navigate(
                                      `/projects/${project.projectUuid}/home`,
                                  );
                              },
                          }
                        : undefined,
            });

            if (shouldSwapProjectRoute) {
                void navigate(
                    swappableRouteMatch.path.replace(
                        activeProjectUuid,
                        project.projectUuid,
                    ),
                );
            } else {
                void navigate(`/projects/${project.projectUuid}/home`);
            }
        },
        [
            activeProjectUuid,
            navigate,
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

    // user has permission to create preview project on an organization level
    const orgRoleCanCreatePreviews = useMemo(() => {
        return user.data?.ability.can(
            'create',
            subject('Project', {
                organizationUuid: user.data.organizationUuid,
                type: ProjectType.PREVIEW,
            }),
        );
    }, [user.data]);

    const inactiveProjects = useMemo(() => {
        if (!activeProjectUuid || !projects) return [];

        const filteredProjects = projects
            .filter((p) => p.projectUuid !== activeProjectUuid)
            .filter((project) => {
                switch (project.type) {
                    case ProjectType.DEFAULT:
                        return true;
                    case ProjectType.PREVIEW:
                        // check if user has permission to create preview project on an organization level (developer, admin)
                        // or check if user has permission to create preview project on a project level
                        // - they should have permission (developer, admin) to the upstream project
                        return (
                            orgRoleCanCreatePreviews ||
                            user.data?.ability.can(
                                'create',
                                subject('Project', {
                                    upstreamProjectUuid: project.projectUuid,
                                    type: ProjectType.PREVIEW,
                                }),
                            )
                        );
                    default:
                        return assertUnreachable(
                            project.type,
                            `Unknown project type: ${project.type}`,
                        );
                }
            });

        if (sortConfig.option === 'default') {
            return filteredProjects;
        }

        return [...filteredProjects].sort((a, b) => {
            if (sortConfig.option === 'alphabetical') {
                // First sort by type (non-preview first)
                if (a.type !== b.type) {
                    return a.type === ProjectType.DEFAULT ? -1 : 1;
                }
                // Then sort alphabetically
                const comparison = a.name.localeCompare(b.name);
                return sortConfig.direction === 'asc'
                    ? comparison
                    : -comparison;
            }

            if (sortConfig.option === 'type') {
                if (a.type !== b.type) {
                    // Sort by type based on direction
                    if (sortConfig.direction === 'asc') {
                        // Non-preview first
                        return a.type === ProjectType.DEFAULT ? -1 : 1;
                    } else {
                        // Preview first
                        return a.type === ProjectType.PREVIEW ? -1 : 1;
                    }
                }
                // If same type, sort by name
                return a.name.localeCompare(b.name);
            }

            if (sortConfig.option === 'date') {
                const dateA = new Date(a.createdAt).getTime();
                const dateB = new Date(b.createdAt).getTime();
                return sortConfig.direction === 'asc'
                    ? dateA - dateB
                    : dateB - dateA;
            }

            return 0;
        });
    }, [
        activeProjectUuid,
        projects,
        orgRoleCanCreatePreviews,
        user.data,
        sortConfig,
    ]);

    const userCanCreatePreview = useMemo(() => {
        if (isLoadingProjects || !projects || !user.data) return false;

        return projects
            .filter((p) => p.type === ProjectType.DEFAULT)
            .some((project) =>
                user.data.ability.can(
                    'create',
                    subject('Project', {
                        organizationUuid: user.data.organizationUuid,
                        upstreamProjectUuid: project.projectUuid,
                        type: ProjectType.PREVIEW,
                    }),
                ),
            );
    }, [isLoadingProjects, projects, user.data]);

    const [isCreatePreviewOpen, setIsCreatePreview] = useState(false);

    const getSortDisplay = () => {
        if (sortConfig.option === 'default') {
            return {
                icon: (
                    <MantineIcon
                        icon={IconArrowsSort}
                        size="md"
                        color="gray.5"
                    />
                ),
                label: null,
            };
        }

        const selectedOption = sortOptions.find(
            (opt) => opt.id === sortConfig.option,
        );

        return {
            icon:
                sortConfig.direction === 'desc' ? (
                    <MantineIcon
                        icon={IconArrowDown}
                        size="md"
                        color="blue.6"
                    />
                ) : (
                    <MantineIcon icon={IconArrowUp} size="md" color="blue.6" />
                ),
            label: selectedOption?.activeLabel || '',
        };
    };

    if (
        isLoadingProjects ||
        isLoadingActiveProjectUuid ||
        !projects ||
        projects.length === 0
    ) {
        return null;
    }

    return (
        <>
            <Menu
                position="bottom-end"
                withArrow
                shadow="lg"
                arrowOffset={16}
                offset={-2}
                styles={{
                    dropdown: {
                        maxHeight: 450,
                        overflow: 'auto',
                    },
                }}
                closeOnItemClick={dropdownView === 'projects'}
                onClose={() => {
                    setDropdownView('projects');
                }}
            >
                <Menu.Target>
                    <Button
                        maw={200}
                        variant="default"
                        size="xs"
                        disabled={
                            isLoadingProjects || isLoadingActiveProjectUuid
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
                    {inactiveProjects.length > 0 && (
                        <Box
                            pos="sticky"
                            top={0}
                            bg="gray.9"
                            sx={(theme) => ({
                                boxShadow: `0 -4px ${theme.colors.gray[9]}`,
                                zIndex: 10,
                            })}
                        >
                            <Group
                                position="apart"
                                pr={dropdownView === 'projects' ? 'md' : 'xs'}
                                py={4}
                            >
                                {dropdownView === 'projects' ? (
                                    <>
                                        <Group spacing={4}>
                                            <Menu.Label py={0} m={0}>
                                                All Projects
                                            </Menu.Label>
                                        </Group>
                                    </>
                                ) : (
                                    <>
                                        <Group spacing={4}>
                                            <Menu.Label py={0} m={0}>
                                                Sort projects
                                            </Menu.Label>
                                        </Group>
                                    </>
                                )}

                                <Group
                                    spacing={4}
                                    sx={{ cursor: 'pointer' }}
                                    onClick={toggleDropdownView}
                                >
                                    {getSortDisplay().label && (
                                        <Text {...MENU_TEXT_PROPS} c="blue.6">
                                            {getSortDisplay().label}
                                        </Text>
                                    )}
                                    <Button
                                        variant="subtle"
                                        p={0}
                                        h="auto"
                                        w="auto"
                                        onClick={(
                                            e: React.MouseEvent<HTMLButtonElement>,
                                        ) => {
                                            if (
                                                sortConfig.option !== 'default'
                                            ) {
                                                toggleSortDirection();
                                                e.stopPropagation();
                                            } else {
                                                setDropdownView('sort');
                                            }
                                        }}
                                    >
                                        {getSortDisplay().icon}
                                    </Button>
                                </Group>
                            </Group>
                            <Menu.Divider />
                        </Box>
                    )}

                    {dropdownView === 'projects' ? (
                        <>
                            {inactiveProjects.map((item) => (
                                <InactiveProjectItem
                                    key={item.projectUuid}
                                    item={item}
                                    handleProjectChange={handleProjectChange}
                                />
                            ))}

                            {userCanCreatePreview && (
                                <Box
                                    pos="sticky"
                                    bottom={0}
                                    bg="gray.9"
                                    sx={(theme) => ({
                                        boxShadow: `0 4px ${theme.colors.gray[9]}`,
                                        zIndex: 10,
                                    })}
                                >
                                    {inactiveProjects.length > 0 && (
                                        <Menu.Divider />
                                    )}

                                    <Menu.Item
                                        onClick={(
                                            e: React.MouseEvent<HTMLButtonElement>,
                                        ) => {
                                            setIsCreatePreview(
                                                !isCreatePreviewOpen,
                                            );
                                            e.stopPropagation();
                                        }}
                                        icon={
                                            <MantineIcon
                                                icon={IconPlus}
                                                size="md"
                                            />
                                        }
                                    >
                                        <Text {...MENU_TEXT_PROPS}>
                                            Create Preview
                                        </Text>
                                    </Menu.Item>
                                </Box>
                            )}
                        </>
                    ) : (
                        <Box
                            styles={{
                                root: {
                                    maxHeight: 300,
                                    overflow: 'auto',
                                },
                            }}
                        >
                            {sortOptions.map((option) => (
                                <Menu.Item
                                    key={option.id}
                                    onClick={() =>
                                        handleSortOptionChange(option.id)
                                    }
                                >
                                    <Group position="apart" spacing="xs" noWrap>
                                        <Text
                                            {...MENU_TEXT_PROPS}
                                            c={
                                                sortConfig.option === option.id
                                                    ? 'blue.6'
                                                    : 'gray.2'
                                            }
                                        >
                                            {option.title}
                                        </Text>
                                    </Group>
                                </Menu.Item>
                            ))}

                            <Box
                                pos="sticky"
                                bottom={0}
                                bg="gray.9"
                                sx={(theme) => ({
                                    boxShadow: `0 4px ${theme.colors.gray[9]}`,
                                    zIndex: 10,
                                })}
                            >
                                <Menu.Divider />
                                <Menu.Item
                                    onClick={resetSort}
                                    icon={
                                        sortConfig.option === 'default' ? (
                                            <MantineIcon
                                                icon={IconArrowsSort}
                                                size="md"
                                                color="gray.5"
                                            />
                                        ) : null
                                    }
                                >
                                    <Text {...MENU_TEXT_PROPS}>
                                        Reset order
                                    </Text>
                                </Menu.Item>
                            </Box>
                        </Box>
                    )}
                </Menu.Dropdown>
            </Menu>

            {isCreatePreviewOpen && (
                <CreatePreviewModal
                    isOpened={isCreatePreviewOpen}
                    onClose={() => setIsCreatePreview(false)}
                />
            )}
        </>
    );
};

export default ProjectSwitcher;
