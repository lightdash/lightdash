import { subject } from '@casl/ability';
import {
    assertUnreachable,
    ProjectType,
    type OrganizationProject,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    getDefaultZIndex,
    Group,
    Highlight,
    Menu,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconArrowRight,
    IconChevronDown,
    IconChevronLeft,
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
import { useProject } from '../../hooks/useProject';
import { useProjects } from '../../hooks/useProjects';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import { CreatePreviewModal } from './CreatePreviewProjectModal';
import classes from './ProjectSwitcher.module.css';

const MENU_TEXT_PROPS = {
    c: 'ldGray.9',
    fz: 'xs',
    fw: 500,
};

const getExpiresInDays = (expiresAt: Date | null): number | null => {
    if (!expiresAt) return null;
    const now = new Date();
    const diffMs = new Date(expiresAt).getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
};

const CurrentBadge: FC = () => (
    <Badge
        color="blue"
        variant="filled"
        size="xs"
        radius="sm"
        fw={600}
        className={classes.badge}
    >
        current
    </Badge>
);

const ExpiryBadge: FC<{ expiresAt: Date | null }> = ({ expiresAt }) => {
    const expiresInDays = getExpiresInDays(expiresAt);
    if (expiresInDays === null) return null;
    return (
        <Badge
            color="orange"
            variant="light"
            size="xs"
            radius="sm"
            fw={450}
            className={classes.badge}
        >
            {expiresInDays === 0
                ? 'Expires today'
                : `Expires in ${expiresInDays}d`}
        </Badge>
    );
};

/**
 * Trigger button label: plain project name for main projects, or an
 * `upstream › preview` breadcrumb when the active project is a preview.
 */
const SwitcherLabel: FC<{
    activeProjectName: string;
    upstreamProjectName: string | null;
}> = ({ activeProjectName, upstreamProjectName }) => {
    const { ref: truncatedRef, isTruncated } = useIsTruncated<HTMLDivElement>();

    if (!upstreamProjectName) {
        return (
            <Group gap={6} wrap="nowrap">
                <Text truncate fw={500} fz="xs">
                    {activeProjectName}
                </Text>
                <MantineIcon icon={IconChevronDown} size="sm" color="ldGray.6" />
            </Group>
        );
    }

    return (
        <Group gap={4} wrap="nowrap">
            <Text fw={500} fz="xs" c="ldGray.6" className={classes.upstreamName}>
                {upstreamProjectName}
            </Text>
            <MantineIcon
                icon={IconChevronRight}
                size="xs"
                color="ldGray.5"
                className={classes.breadcrumbSeparator}
            />
            <Tooltip
                withinPortal
                label={activeProjectName}
                disabled={!isTruncated}
            >
                <Text
                    ref={truncatedRef}
                    truncate
                    fw={600}
                    fz="xs"
                    c="blue.4"
                    className={classes.previewName}
                >
                    {activeProjectName}
                </Text>
            </Tooltip>
            <MantineIcon
                icon={IconChevronDown}
                size="sm"
                color="ldGray.6"
                className={classes.breadcrumbSeparator}
            />
        </Group>
    );
};

const ProjectRow: FC<{
    item: OrganizationProject;
    previewCount: number;
    isActive: boolean;
    searchQuery: string;
    onNavigate: (projectUuid: string) => void;
    onDrill: (projectUuid: string) => void;
}> = ({ item, previewCount, isActive, searchQuery, onNavigate, onDrill }) => {
    const { ref: truncatedRef, isTruncated } = useIsTruncated<HTMLDivElement>();

    return (
        <Menu.Item onClick={() => !isActive && onNavigate(item.projectUuid)}>
            <Group gap="sm" justify="space-between" wrap="nowrap">
                <Tooltip
                    withinPortal
                    label={item.name}
                    maw={300}
                    disabled={!isTruncated}
                    multiline
                >
                    <Highlight
                        ref={truncatedRef}
                        highlight={searchQuery.length >= 2 ? searchQuery : ''}
                        {...MENU_TEXT_PROPS}
                        truncate="end"
                        maw={260}
                        fw={isActive ? 600 : 500}
                        c={isActive ? 'ldGray.9' : 'inherit'}
                    >
                        {item.name}
                    </Highlight>
                </Tooltip>

                <Group gap="xs" wrap="nowrap">
                    {isActive && <CurrentBadge />}
                    {previewCount > 0 && (
                        <Box
                            component="span"
                            role="button"
                            tabIndex={-1}
                            className={classes.previewCountChip}
                            onClick={(e) => {
                                e.stopPropagation();
                                onDrill(item.projectUuid);
                            }}
                        >
                            <Text fz="xs" fw={500} c="inherit">
                                {previewCount}{' '}
                                {previewCount === 1 ? 'preview' : 'previews'}
                            </Text>
                            <MantineIcon icon={IconChevronRight} size="xs" />
                        </Box>
                    )}
                </Group>
            </Group>
        </Menu.Item>
    );
};

const PreviewRow: FC<{
    item: OrganizationProject;
    isActive: boolean;
    searchQuery: string;
    upstreamName: string | null;
    onSelect: (projectUuid: string) => void;
}> = ({ item, isActive, searchQuery, upstreamName, onSelect }) => {
    const { ref: truncatedRef, isTruncated } = useIsTruncated<HTMLDivElement>();

    return (
        <Menu.Item
            onClick={() => !isActive && onSelect(item.projectUuid)}
            disabled={isActive}
            className={isActive ? classes.activePreviewItem : undefined}
        >
            <Group gap="sm" justify="space-between" wrap="nowrap">
                <Group gap={6} wrap="nowrap" miw={0}>
                    <Tooltip
                        withinPortal
                        label={item.name}
                        maw={300}
                        disabled={!isTruncated}
                        multiline
                    >
                        <Highlight
                            ref={truncatedRef}
                            highlight={
                                searchQuery.length >= 2 ? searchQuery : ''
                            }
                            {...MENU_TEXT_PROPS}
                            truncate="end"
                            maw={220}
                            fw={isActive ? 600 : 500}
                            c={isActive ? 'ldGray.9' : 'inherit'}
                        >
                            {item.name}
                        </Highlight>
                    </Tooltip>
                    {upstreamName && (
                        <Text fz={10} c="ldGray.5" truncate maw={120}>
                            {upstreamName}
                        </Text>
                    )}
                </Group>

                <Group gap="xs" wrap="nowrap">
                    {isActive && <CurrentBadge />}
                    <ExpiryBadge expiresAt={item.expiresAt} />
                </Group>
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

    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Only fetch all projects when menu is opened
    const { isInitialLoading: isLoadingProjects, data: projects } = useProjects(
        {
            enabled: isMenuOpen,
        },
    );
    const { isLoading: isLoadingActiveProjectUuid, activeProjectUuid } =
        useActiveProjectUuid();
    // Fetch only the active project for the button label (lightweight)
    const { data: activeProject } = useProject(activeProjectUuid);
    // When inside a preview, fetch its upstream project to show in the breadcrumb
    const upstreamProjectUuid =
        activeProject?.type === ProjectType.PREVIEW
            ? activeProject.upstreamProjectUuid
            : undefined;
    const { data: upstreamProject } = useProject(upstreamProjectUuid);

    const { mutate: setLastProjectMutation } = useUpdateActiveProjectMutation();
    const location = useLocation();
    const isHomePage = !!useMatch(`/projects/${activeProjectUuid}/home`);

    const [isCreatePreviewOpen, setIsCreatePreview] = useState(false);
    // Project drilled into to view its previews; null = top-level project list
    const [drilledProjectUuid, setDrilledProjectUuid] = useState<string | null>(
        null,
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);

    const resetMenuState = useCallback(() => {
        setSearchQuery('');
        setDrilledProjectUuid(null);
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

            setIsMenuOpen(false);
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

    const canCreatePreviewForProject = useCallback(
        (projectUuid: string) => {
            if (!user.data) return false;
            return (
                orgRoleCanCreatePreviews ||
                user.data.ability.can(
                    'create',
                    subject('Project', {
                        organizationUuid: user.data.organizationUuid,
                        upstreamProjectUuid: projectUuid,
                        type: ProjectType.PREVIEW,
                    }),
                )
            );
        },
        [user.data, orgRoleCanCreatePreviews],
    );

    const { baseProjects, previewsByUpstream, baseProjectsByUuid } =
        useMemo(() => {
            const base = (projects ?? []).filter(
                (p) => p.type === ProjectType.DEFAULT,
            );

            // Only show previews the user is allowed to access. Visibility is
            // unchanged from before: org-level preview creators, or developers
            // of the preview project itself.
            const visiblePreviews = (projects ?? []).filter((project) => {
                switch (project.type) {
                    case ProjectType.DEFAULT:
                        return false;
                    case ProjectType.PREVIEW:
                        return (
                            orgRoleCanCreatePreviews ||
                            !!user.data?.ability.can(
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

            const byUpstream = new Map<string, OrganizationProject[]>();
            visiblePreviews.forEach((preview) => {
                if (!preview.upstreamProjectUuid) return;
                const existing =
                    byUpstream.get(preview.upstreamProjectUuid) ?? [];
                existing.push(preview);
                byUpstream.set(preview.upstreamProjectUuid, existing);
            });

            return {
                baseProjects: base,
                previewsByUpstream: byUpstream,
                baseProjectsByUuid: new Map(
                    base.map((p) => [p.projectUuid, p] as const),
                ),
            };
        }, [projects, orgRoleCanCreatePreviews, user.data]);

    const userCanCreatePreview = useMemo(
        () => baseProjects.some((p) => canCreatePreviewForProject(p.projectUuid)),
        [baseProjects, canCreatePreviewForProject],
    );

    const totalPreviewCount = useMemo(
        () =>
            Array.from(previewsByUpstream.values()).reduce(
                (sum, list) => sum + list.length,
                0,
            ),
        [previewsByUpstream],
    );

    const search = debouncedSearchQuery.trim().toLowerCase();
    const isSearching = search.length >= 2;

    const drilledProject = drilledProjectUuid
        ? baseProjectsByUuid.get(drilledProjectUuid) ?? null
        : null;

    // Level 1 search results: matching projects + flattened matching previews
    const { matchingProjects, matchingPreviews } = useMemo(() => {
        if (!isSearching) {
            return { matchingProjects: baseProjects, matchingPreviews: [] };
        }
        const projectMatches = baseProjects.filter((p) =>
            p.name.toLowerCase().includes(search),
        );
        const previewMatches = Array.from(previewsByUpstream.values())
            .flat()
            .filter((p) => p.name.toLowerCase().includes(search));
        return {
            matchingProjects: projectMatches,
            matchingPreviews: previewMatches,
        };
    }, [isSearching, search, baseProjects, previewsByUpstream]);

    // Level 2: previews of the drilled project, scoped by search
    const drilledPreviews = useMemo(() => {
        if (!drilledProjectUuid) return [];
        const all = previewsByUpstream.get(drilledProjectUuid) ?? [];
        if (!isSearching) return all;
        return all.filter((p) => p.name.toLowerCase().includes(search));
    }, [drilledProjectUuid, previewsByUpstream, isSearching, search]);

    const handleOpenCreatePreview = useCallback(() => {
        setIsMenuOpen(false);
        setIsCreatePreview(true);
    }, []);

    // Don't render if we're still loading the active project UUID
    if (isLoadingActiveProjectUuid || !activeProjectUuid) {
        return null;
    }

    const renderSearchInput = (placeholder: string) => (
        <Box className={classes.searchHeader}>
            <TextInput
                placeholder={placeholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                leftSection={<MantineIcon icon={IconSearch} size="sm" />}
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
                classNames={{ input: classes.searchInput }}
            />
        </Box>
    );

    return (
        <>
            <Menu
                position="bottom-end"
                withArrow
                shadow="lg"
                arrowOffset={16}
                offset={-2}
                opened={isMenuOpen}
                closeOnItemClick={false}
                onChange={(opened) => {
                    setIsMenuOpen(opened);
                    if (opened) {
                        // When inside a preview, open straight into its
                        // upstream project's preview list so the current
                        // preview is visible.
                        setSearchQuery('');
                        setDrilledProjectUuid(upstreamProjectUuid ?? null);
                    } else {
                        resetMenuState();
                    }
                }}
                classNames={{ dropdown: classes.dropdown }}
                zIndex={getDefaultZIndex('max')}
                portalProps={{ target: '#navbar-header' }}
            >
                <Menu.Target>
                    <Button
                        variant="default"
                        size="xs"
                        className={classes.targetButton}
                    >
                        <SwitcherLabel
                            activeProjectName={
                                activeProject?.name ?? 'Select a project'
                            }
                            upstreamProjectName={upstreamProject?.name ?? null}
                        />
                    </Button>
                </Menu.Target>

                <Menu.Dropdown w={400}>
                    {isLoadingProjects ? (
                        <Box p="lg" ta="center">
                            <Text {...MENU_TEXT_PROPS}>Loading projects...</Text>
                        </Box>
                    ) : drilledProject ? (
                        <>
                            {renderSearchInput(
                                `Search previews in ${drilledProject.name}...`,
                            )}
                            <Box
                                component="button"
                                className={classes.drillHeader}
                                onClick={() => {
                                    setDrilledProjectUuid(null);
                                    setSearchQuery('');
                                }}
                            >
                                <Group gap="xs" wrap="nowrap">
                                    <MantineIcon
                                        icon={IconChevronLeft}
                                        size="sm"
                                        color="ldGray.6"
                                    />
                                    <Text fz="xs" fw={500} c="ldGray.5">
                                        Projects
                                    </Text>
                                    <Text fz="xs" c="ldGray.4">
                                        /
                                    </Text>
                                    <Text fz="xs" fw={600} c="ldDark.9">
                                        {drilledProject.name}
                                    </Text>
                                </Group>
                            </Box>
                            <ScrollArea.Autosize mah={260}>
                                <Stack gap={0}>
                                    {drilledPreviews.length > 0 ? (
                                        drilledPreviews.map((item) => (
                                            <PreviewRow
                                                key={item.projectUuid}
                                                item={item}
                                                searchQuery={
                                                    debouncedSearchQuery
                                                }
                                                upstreamName={null}
                                                isActive={
                                                    item.projectUuid ===
                                                    activeProjectUuid
                                                }
                                                onSelect={handleProjectChange}
                                            />
                                        ))
                                    ) : (
                                        <Box p="lg" ta="center">
                                            <Text {...MENU_TEXT_PROPS}>
                                                {isSearching
                                                    ? `No previews match "${debouncedSearchQuery}"`
                                                    : 'No previews available'}
                                            </Text>
                                        </Box>
                                    )}
                                </Stack>
                            </ScrollArea.Autosize>
                            {canCreatePreviewForProject(
                                drilledProject.projectUuid,
                            ) && (
                                <Box className={classes.stickyFooter}>
                                    <Menu.Item
                                        onClick={handleOpenCreatePreview}
                                        leftSection={
                                            <MantineIcon
                                                icon={IconPlus}
                                                size="md"
                                            />
                                        }
                                    >
                                        <Text {...MENU_TEXT_PROPS}>
                                            Create Preview in{' '}
                                            {drilledProject.name}
                                        </Text>
                                    </Menu.Item>
                                </Box>
                            )}
                        </>
                    ) : (
                        <>
                            {baseProjects.length + totalPreviewCount > 2 &&
                                renderSearchInput('Search projects...')}
                            <Box
                                className={classes.sectionHeader}
                                display={
                                    matchingProjects.length > 0
                                        ? 'block'
                                        : 'none'
                                }
                            >
                                <Group gap="xs" wrap="nowrap">
                                    <Text fz="xs" fw={600} c="ldDark.9">
                                        Projects
                                    </Text>
                                    <Badge
                                        color="blue"
                                        variant="light"
                                        size="xs"
                                        radius="sm"
                                        fw={700}
                                        className={classes.badge}
                                    >
                                        {matchingProjects.length}
                                    </Badge>
                                </Group>
                            </Box>
                            <ScrollArea.Autosize mah={260}>
                                <Stack gap={0}>
                                    {matchingProjects.map((item) => (
                                        <ProjectRow
                                            key={item.projectUuid}
                                            item={item}
                                            previewCount={
                                                previewsByUpstream.get(
                                                    item.projectUuid,
                                                )?.length ?? 0
                                            }
                                            searchQuery={debouncedSearchQuery}
                                            isActive={
                                                item.projectUuid ===
                                                activeProjectUuid
                                            }
                                            onNavigate={handleProjectChange}
                                            onDrill={(projectUuid) => {
                                                setDrilledProjectUuid(
                                                    projectUuid,
                                                );
                                                setSearchQuery('');
                                            }}
                                        />
                                    ))}

                                    {isSearching &&
                                        matchingPreviews.length > 0 && (
                                            <>
                                                <Box
                                                    className={
                                                        classes.sectionHeader
                                                    }
                                                >
                                                    <Text
                                                        fz={10}
                                                        fw={600}
                                                        c="ldGray.5"
                                                        tt="uppercase"
                                                    >
                                                        Matching previews ·{' '}
                                                        {matchingPreviews.length}
                                                    </Text>
                                                </Box>
                                                {matchingPreviews.map(
                                                    (item) => (
                                                        <PreviewRow
                                                            key={
                                                                item.projectUuid
                                                            }
                                                            item={item}
                                                            searchQuery={
                                                                debouncedSearchQuery
                                                            }
                                                            upstreamName={
                                                                item.upstreamProjectUuid
                                                                    ? baseProjectsByUuid.get(
                                                                          item.upstreamProjectUuid,
                                                                      )?.name ??
                                                                      null
                                                                    : null
                                                            }
                                                            isActive={
                                                                item.projectUuid ===
                                                                activeProjectUuid
                                                            }
                                                            onSelect={
                                                                handleProjectChange
                                                            }
                                                        />
                                                    ),
                                                )}
                                            </>
                                        )}

                                    {matchingProjects.length === 0 &&
                                        matchingPreviews.length === 0 && (
                                            <Box p="lg" ta="center">
                                                <Stack gap="xs" align="center">
                                                    <MantineIcon
                                                        icon={IconSearch}
                                                        size="lg"
                                                        color="ldGray.5"
                                                    />
                                                    <Text {...MENU_TEXT_PROPS}>
                                                        {isSearching
                                                            ? `No projects or previews match "${debouncedSearchQuery}"`
                                                            : 'No projects available'}
                                                    </Text>
                                                </Stack>
                                            </Box>
                                        )}
                                </Stack>
                            </ScrollArea.Autosize>

                            {userCanCreatePreview && (
                                <Box className={classes.stickyFooter}>
                                    <Menu.Item
                                        onClick={handleOpenCreatePreview}
                                        leftSection={
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
                    )}
                </Menu.Dropdown>
            </Menu>

            {isCreatePreviewOpen && (
                <CreatePreviewModal
                    isOpened={isCreatePreviewOpen}
                    onClose={() => setIsCreatePreview(false)}
                    preselectedProjectUuid={drilledProjectUuid ?? undefined}
                />
            )}
        </>
    );
};

export default ProjectSwitcher;
