import { subject } from '@casl/ability';
import {
    assertUnreachable,
    FeatureFlags,
    getResourceViewItemName,
    ResourceViewItemType,
    type ResourceViewItem,
} from '@lightdash/common';
import {
    Box,
    Button,
    Center,
    Collapse,
    getDefaultZIndex,
    Loader,
    Menu,
    ScrollArea,
    Text,
} from '@mantine/core';
import {
    IconCategory,
    IconChartAreaLine,
    IconChevronDown,
    IconChevronRight,
    IconAppWindow,
    IconFolder,
    IconFolders,
    IconLayoutDashboard,
    IconPuzzle,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import { ReviewRequestsMenuItem } from '../../ee/features/contentReview';
import { useChartTypesEnabled } from '../../features/chartTypes/hooks/useChartTypesEnabled';
import { useHasMetricsInCatalog } from '../../features/metricsCatalog/hooks/useMetricsCatalog';
import { useRecentlyDeletedAccess } from '../../features/recentlyDeleted/hooks/useRecentlyDeletedAccess';
import { useFavorites } from '../../hooks/favorites/useFavorites';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useSpaceSummaries } from '../../hooks/useSpaces';
import useApp from '../../providers/App/useApp';
import scrollAreaClasses from '../../styles/ScrollArea.module.css';
import MantineIcon from '../common/MantineIcon';
import { PolymorphicGroupButton } from '../common/PolymorphicGroupButton';
import TruncatedText from '../common/TruncatedText';
import { MetricsLink } from './MetricsLink';

interface Props {
    projectUuid: string;
}

const getFavoriteItemUrl = (
    projectUuid: string,
    projectUrlIdentifier: string,
    item: ResourceViewItem,
) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return `/projects/${projectUrlIdentifier}/dashboards/${item.data.slug}/view`;
        case ResourceViewItemType.CHART:
            return `/projects/${projectUrlIdentifier}/saved/${item.data.slug}`;
        case ResourceViewItemType.SPACE:
            return `/projects/${projectUrlIdentifier}/spaces/${item.data.uuid}`;
        case ResourceViewItemType.DATA_APP:
            return `/projects/${projectUuid}/apps/${item.data.uuid}/view`;
        default:
            return assertUnreachable(item, `Unknown favorite item type`);
    }
};

const getFavoriteItemIcon = (item: ResourceViewItem) => {
    switch (item.type) {
        case ResourceViewItemType.DASHBOARD:
            return IconLayoutDashboard;
        case ResourceViewItemType.CHART:
            return IconChartAreaLine;
        case ResourceViewItemType.SPACE:
            return IconFolder;
        case ResourceViewItemType.DATA_APP:
            return IconAppWindow;
        default:
            return assertUnreachable(item, `Unknown favorite item type`);
    }
};

const BrowseMenu: FC<Props> = ({ projectUuid }) => {
    const canManageDeletedContent = useRecentlyDeletedAccess(projectUuid);
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    // Track if menu has ever been opened to defer loading spaces
    const [hasBeenOpened, setHasBeenOpened] = useState(false);
    const [spacesExpanded, setSpacesExpanded] = useState(false);

    const { data: spaces, isInitialLoading } = useSpaceSummaries(
        projectUuid,
        true,
        {
            select: (data) => data.filter((space) => !space.parentSpaceUuid),
            enabled: hasBeenOpened,
        },
    );
    const { data: hasMetrics } = useHasMetricsInCatalog({
        projectUuid,
    });
    const { data: favorites } = useFavorites(projectUuid);
    const { user } = useApp();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const chartTypesEnabled = useChartTypesEnabled();
    const canViewDataApps = user.data?.ability?.can('view', 'DataApp') ?? false;
    // The gallery list endpoint is gated on `manage Explore`, not on data app access.
    const canViewChartTypes =
        user.data?.ability?.can(
            'manage',
            subject('Explore', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
            }),
        ) ?? false;

    const hasFavorites = favorites && favorites.length > 0;
    const hasSpaces = isInitialLoading || (spaces && spaces.length > 0);

    return (
        <Menu
            withArrow
            position="bottom-start"
            arrowOffset={16}
            offset={-2}
            zIndex={getDefaultZIndex('max')}
            portalProps={{ target: '#navbar-header' }}
            onChange={(opened) => {
                if (opened && !hasBeenOpened) {
                    setHasBeenOpened(true);
                }
            }}
        >
            <Menu.Target>
                <Button
                    variant="default"
                    size="xs"
                    fz="sm"
                    leftSection={
                        <MantineIcon color="dimmed" icon={IconCategory} />
                    }
                    // Navigation anchor for scope walkthroughs (data-tour-via);
                    // the hint is the step's instruction when a path uses it.
                    data-tour-nav="browse"
                    data-tour-hint="Click Browse"
                >
                    Browse
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    component={Link}
                    to={`/projects/${projectUrlIdentifier}/spaces`}
                    leftSection={<MantineIcon icon={IconFolders} />}
                    data-tour-nav="all-spaces"
                    data-tour-hint="Open All Spaces"
                    // Also the action of the view:Space walkthrough: finding
                    // content through spaces starts here, and the row picked
                    // after it opens the space. See scripts/scope-tours.
                    data-tour-scope="view:Space"
                    data-tour-step="2"
                    data-tour-route="/projects/:projectUuid/home"
                    data-tour-label="Open All Spaces"
                    data-tour-title="Find content through spaces"
                    data-tour-interactive="true"
                    data-tour-via='[data-tour-nav="browse"]'
                    data-tour-then='[data-tour-anchor="space-row"][data-tour-value="Training"]'
                    data-tour-docs="explore/search.mdx#browsing-instead-of-searching:p3:1"
                >
                    All Spaces
                </Menu.Item>

                <Menu.Item
                    component={Link}
                    to={`/projects/${projectUrlIdentifier}/dashboards`}
                    leftSection={<MantineIcon icon={IconLayoutDashboard} />}
                    data-tour-nav="all-dashboards"
                    data-tour-hint="Open All dashboards"
                >
                    All dashboards
                </Menu.Item>

                <Menu.Item
                    component={Link}
                    to={`/projects/${projectUrlIdentifier}/saved`}
                    leftSection={<MantineIcon icon={IconChartAreaLine} />}
                    data-tour-nav="all-charts"
                    data-tour-hint="Open All saved charts"
                >
                    All saved charts
                </Menu.Item>

                {dataAppsFlag.data?.enabled && canViewDataApps && (
                    <Menu.Item
                        component={Link}
                        to={`/projects/${projectUuid}/apps`}
                        leftSection={<MantineIcon icon={IconAppWindow} />}
                        // Anchor for scope walkthroughs (data-tour-via)
                        data-tour-nav="all-apps"
                        data-tour-hint="Open All data apps"
                    >
                        All data apps
                    </Menu.Item>
                )}

                {chartTypesEnabled.enabled && canViewChartTypes && (
                    <Menu.Item
                        component={Link}
                        to={`/projects/${projectUuid}/gallery`}
                        leftSection={<MantineIcon icon={IconPuzzle} />}
                    >
                        Chart types
                    </Menu.Item>
                )}

                {!hasMetrics && (
                    <MetricsLink projectUuid={projectUuid} asMenu />
                )}

                {canManageDeletedContent && (
                    <Menu.Item
                        component={Link}
                        to={`/projects/${projectUrlIdentifier}/recently-deleted`}
                        data-tour-nav="recently-deleted"
                        data-tour-hint="Open Recently deleted"
                    >
                        Recently deleted
                    </Menu.Item>
                )}
                <ReviewRequestsMenuItem projectUuid={projectUuid} />

                {hasFavorites ? (
                    <>
                        <Menu.Divider />
                        <Menu.Label>Favorites</Menu.Label>
                        <ScrollArea
                            scrollbars="y"
                            classNames={{
                                content: scrollAreaClasses.verticalContent,
                            }}
                            scrollbarSize={6}
                            type="hover"
                        >
                            <Box mah={200}>
                                {favorites.map((item) => (
                                    <Menu.Item
                                        key={item.data.uuid}
                                        component={Link}
                                        to={getFavoriteItemUrl(
                                            projectUuid,
                                            projectUrlIdentifier,
                                            item,
                                        )}
                                        leftSection={
                                            <MantineIcon
                                                icon={getFavoriteItemIcon(item)}
                                            />
                                        }
                                    >
                                        <TruncatedText maxWidth={200}>
                                            {getResourceViewItemName(item)}
                                        </TruncatedText>
                                    </Menu.Item>
                                ))}
                            </Box>
                        </ScrollArea>
                    </>
                ) : null}

                {hasSpaces ? (
                    <>
                        <Menu.Divider />
                        <PolymorphicGroupButton
                            component="div"
                            w="100%"
                            px="sm"
                            py={6}
                            gap="xs"
                            justify="space-between"
                            onClick={() => setSpacesExpanded((prev) => !prev)}
                        >
                            <Text fz="xs" fw={500} c="dimmed">
                                Spaces
                            </Text>
                            <MantineIcon
                                color="dimmed"
                                size={14}
                                icon={
                                    spacesExpanded
                                        ? IconChevronDown
                                        : IconChevronRight
                                }
                            />
                        </PolymorphicGroupButton>

                        <Collapse expanded={spacesExpanded}>
                            {isInitialLoading ? (
                                <Center my="sm">
                                    <Loader size="sm" color="gray" />
                                </Center>
                            ) : (
                                <ScrollArea
                                    scrollbars="y"
                                    classNames={{
                                        content:
                                            scrollAreaClasses.verticalContent,
                                    }}
                                    scrollbarSize={6}
                                    type="hover"
                                >
                                    <Box mah={300}>
                                        {spaces
                                            ?.sort((a, b) =>
                                                a.name.localeCompare(b.name),
                                            )
                                            .map((space) => (
                                                <Menu.Item
                                                    key={space.uuid}
                                                    component={Link}
                                                    to={`/projects/${projectUrlIdentifier}/spaces/${space.uuid}`}
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={IconFolder}
                                                        />
                                                    }
                                                >
                                                    <TruncatedText
                                                        maxWidth={200}
                                                    >
                                                        {space.name}
                                                    </TruncatedText>
                                                </Menu.Item>
                                            ))}
                                    </Box>
                                </ScrollArea>
                            )}
                        </Collapse>
                    </>
                ) : null}
            </Menu.Dropdown>
        </Menu>
    );
};
export default BrowseMenu;
