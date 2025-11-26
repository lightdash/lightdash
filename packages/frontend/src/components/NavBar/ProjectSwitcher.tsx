import { subject } from '@casl/ability';
import {
    ProjectType,
    assertUnreachable,
    type OrganizationProject,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Collapse,
    Group,
    Highlight,
    Menu,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconArrowRight,
    IconChevronDown,
    IconChevronRight,
    IconPlus,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
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

const MENU_TEXT_PROPS = {
    c: 'gray.1',
    fz: 'xs',
    fw: 500,
};

type GroupState = 'expanded' | 'collapsed' | 'filtered';

interface GroupStates {
    base: GroupState;
    preview: GroupState;
}

const GroupHeader: FC<{
    title: string;
    count: number;
    state: GroupState;
    onToggle: () => void;
    badgeColor: string;
    isVisible: boolean;
}> = ({ title, count, onToggle, badgeColor, isVisible }) => {
    // Show as expanded if group is visible (either naturally expanded or auto-expanded by search)
    const isExpanded = isVisible;

    return (
        <UnstyledButton
            onClick={onToggle}
            w="100%"
            p="xs"
            sx={(theme) => ({
                '&:hover': {
                    backgroundColor: theme.colors.ldDark[6],
                },
            })}
        >
            <Group spacing="xs" position="apart" noWrap>
                <Group spacing="xs" noWrap>
                    <Text {...MENU_TEXT_PROPS} fw={600} c="gray.4">
                        {title}
                    </Text>
                    <Badge
                        color={badgeColor}
                        variant="light"
                        size="xs"
                        radius="sm"
                        fw={700}
                        sx={{
                            textTransform: 'none',
                        }}
                    >
                        {count}
                    </Badge>
                </Group>
                <MantineIcon
                    icon={isExpanded ? IconChevronDown : IconChevronRight}
                    size="sm"
                    color="gray.5"
                />
            </Group>
        </UnstyledButton>
    );
};

const ProjectItem: FC<{
    item: OrganizationProject;
    handleProjectChange: (newUuid: string) => void;
    searchQuery?: string;
    isActive?: boolean;
}> = ({ item, handleProjectChange, searchQuery, isActive = false }) => {
    const { ref: truncatedRef, isTruncated } = useIsTruncated<HTMLDivElement>();

    return (
        <Menu.Item
            key={item.projectUuid}
            onClick={() => !isActive && handleProjectChange(item.projectUuid)}
            disabled={isActive}
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
                    <Highlight
                        ref={truncatedRef}
                        highlight={
                            searchQuery && searchQuery.length >= 2
                                ? searchQuery
                                : ''
                        }
                        {...MENU_TEXT_PROPS}
                        truncate
                        maw={350}
                        fw={isActive ? 600 : 500}
                        c={isActive ? 'gray.5' : 'inherit'}
                    >
                        {item.name}
                    </Highlight>
                </Tooltip>

                {(item.type === ProjectType.PREVIEW || isActive) && (
                    <Badge
                        color={isActive ? 'green' : 'yellow.1'}
                        variant="light"
                        size="xs"
                        radius="sm"
                        fw={400}
                        sx={{
                            textTransform: 'none',
                        }}
                    >
                        {isActive ? 'Active' : 'Preview'}
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

    const [isCreatePreviewOpen, setIsCreatePreview] = useState(false);
    const [groupStates, setGroupStates] = useState<GroupStates>({
        base: 'expanded',
        preview: 'expanded',
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);

    const handleGroupToggle = useCallback((groupType: 'base' | 'preview') => {
        setGroupStates((prev) => {
            const currentState = prev[groupType];

            // Cycle through states: expanded -> collapsed -> filtered -> expanded
            switch (currentState) {
                case 'expanded':
                    return { ...prev, [groupType]: 'collapsed' };
                case 'collapsed':
                    // Enter filter mode: this group filtered, other collapsed
                    if (groupType === 'base') {
                        return { base: 'filtered', preview: 'collapsed' };
                    } else {
                        return { base: 'collapsed', preview: 'filtered' };
                    }
                case 'filtered':
                    // Back to default: both expanded
                    return { base: 'expanded', preview: 'expanded' };
                default:
                    return prev;
            }
        });
    }, []);

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

    const { baseProjects, previewProjects, shouldShowBase, shouldShowPreview } =
        useMemo(() => {
            if (!activeProjectUuid || !projects)
                return {
                    baseProjects: [],
                    previewProjects: [],
                    shouldShowBase: false,
                    shouldShowPreview: false,
                };

            const availableProjects = projects.filter((project) => {
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

            // Apply search filter if query exists
            const searchFiltered =
                debouncedSearchQuery.length >= 2
                    ? availableProjects.filter((project) =>
                          project.name
                              .toLowerCase()
                              .includes(debouncedSearchQuery.toLowerCase()),
                      )
                    : availableProjects;

            const base = searchFiltered.filter(
                (p) => p.type === ProjectType.DEFAULT,
            );
            const preview = searchFiltered.filter(
                (p) => p.type === ProjectType.PREVIEW,
            );

            // Determine visibility based on group states and search
            const hasSearchResults = debouncedSearchQuery.length >= 2;
            const showBase =
                groupStates.base !== 'collapsed' ||
                (hasSearchResults && base.length > 0);
            const showPreview =
                groupStates.preview !== 'collapsed' ||
                (hasSearchResults && preview.length > 0);

            return {
                baseProjects: base,
                previewProjects: preview,
                shouldShowBase: showBase && base.length > 0,
                shouldShowPreview: showPreview && preview.length > 0,
            };
        }, [
            activeProjectUuid,
            projects,
            orgRoleCanCreatePreviews,
            user.data,
            groupStates,
            debouncedSearchQuery,
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
                        minWidth: 250,
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
                            isLoadingProjects || isLoadingActiveProjectUuid
                        }
                        sx={(theme) => ({
                            '&:disabled': {
                                color: theme.white,
                                backgroundColor: theme.colors.ldDark[6],
                                borderColor: theme.colors.ldDark[4],
                            },
                        })}
                    >
                        <Text truncate>
                            {activeProject?.name ?? 'Select a project'}
                        </Text>
                    </Button>
                </Menu.Target>

                <Menu.Dropdown maw={400}>
                    {/* Search Header */}
                    <Box
                        pos="sticky"
                        top={0}
                        bg="gray.9"
                        p="sm"
                        sx={(theme) => ({
                            boxShadow: `0 2px 8px ${theme.colors.gray[9]}`,
                            borderBottom: `1px solid ${theme.colors.dark[4]}`,
                        })}
                    >
                        <TextInput
                            placeholder="Search projects..."
                            value={searchQuery}
                            onChange={(e) =>
                                setSearchQuery(e.currentTarget.value)
                            }
                            icon={<MantineIcon icon={IconSearch} size="sm" />}
                            rightSection={
                                searchQuery ? (
                                    <ActionIcon
                                        size="sm"
                                        variant="transparent"
                                        onClick={() => setSearchQuery('')}
                                    >
                                        <MantineIcon icon={IconX} size="xs" />
                                    </ActionIcon>
                                ) : null
                            }
                            size="xs"
                            styles={{
                                input: {
                                    backgroundColor: 'transparent',
                                    border: `1px solid var(--mantine-color-dark-4)`,
                                    '&:focus': {
                                        borderColor:
                                            'var(--mantine-color-blue-6)',
                                    },
                                },
                            }}
                        />
                    </Box>

                    <Stack spacing={0}>
                        {/* Base Projects Group */}
                        {baseProjects.length > 0 && (
                            <Box>
                                <GroupHeader
                                    title="Projects"
                                    count={baseProjects.length}
                                    state={groupStates.base}
                                    onToggle={() => handleGroupToggle('base')}
                                    badgeColor="blue"
                                    isVisible={shouldShowBase}
                                />
                                <Collapse in={shouldShowBase}>
                                    <Box
                                        sx={{
                                            maxHeight: 200,
                                            overflow: 'auto',
                                        }}
                                    >
                                        <Stack spacing={0}>
                                            {baseProjects.map((item) => (
                                                <ProjectItem
                                                    key={item.projectUuid}
                                                    item={item}
                                                    handleProjectChange={
                                                        handleProjectChange
                                                    }
                                                    searchQuery={
                                                        debouncedSearchQuery
                                                    }
                                                    isActive={
                                                        item.projectUuid ===
                                                        activeProjectUuid
                                                    }
                                                />
                                            ))}
                                        </Stack>
                                    </Box>
                                </Collapse>
                            </Box>
                        )}

                        {/* Preview Projects Group */}
                        {previewProjects.length > 0 && (
                            <Box>
                                <Menu.Divider />
                                <GroupHeader
                                    title="Preview"
                                    count={previewProjects.length}
                                    state={groupStates.preview}
                                    onToggle={() =>
                                        handleGroupToggle('preview')
                                    }
                                    badgeColor="yellow"
                                    isVisible={shouldShowPreview}
                                />
                                <Collapse in={shouldShowPreview}>
                                    <Box
                                        sx={{
                                            maxHeight: 200,
                                            overflow: 'auto',
                                        }}
                                    >
                                        <Stack spacing={0}>
                                            {previewProjects.map((item) => (
                                                <ProjectItem
                                                    key={item.projectUuid}
                                                    item={item}
                                                    handleProjectChange={
                                                        handleProjectChange
                                                    }
                                                    searchQuery={
                                                        debouncedSearchQuery
                                                    }
                                                    isActive={
                                                        item.projectUuid ===
                                                        activeProjectUuid
                                                    }
                                                />
                                            ))}
                                        </Stack>
                                    </Box>
                                </Collapse>
                            </Box>
                        )}

                        {/* Empty State */}
                        {baseProjects.length === 0 &&
                            previewProjects.length === 0 && (
                                <Box p="lg" ta="center">
                                    <Stack spacing="xs" align="center">
                                        <MantineIcon
                                            icon={IconSearch}
                                            size="lg"
                                            color="gray.5"
                                        />
                                        <Text {...MENU_TEXT_PROPS}>
                                            {debouncedSearchQuery.length >= 2
                                                ? `No projects found for "${debouncedSearchQuery}"`
                                                : 'No projects available'}
                                        </Text>
                                    </Stack>
                                </Box>
                            )}
                    </Stack>

                    {userCanCreatePreview && (
                        <Box
                            pos="sticky"
                            bottom={0}
                            bg="gray.9"
                            sx={(theme) => ({
                                // fixes scroll overlap
                                boxShadow: `0 4px ${theme.colors.gray[9]}`,
                            })}
                        >
                            {(baseProjects.length > 0 ||
                                previewProjects.length > 0) && <Menu.Divider />}

                            <Menu.Item
                                onClick={(
                                    e: React.MouseEvent<HTMLButtonElement>,
                                ) => {
                                    setIsCreatePreview(!isCreatePreviewOpen);
                                    e.stopPropagation();
                                }}
                                icon={<MantineIcon icon={IconPlus} size="md" />}
                            >
                                <Text {...MENU_TEXT_PROPS}>Create Preview</Text>
                            </Menu.Item>
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
