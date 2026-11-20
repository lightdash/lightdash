import { ChartKind, ContentType } from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Group,
    List,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import * as Sentry from '@sentry/react';
import { useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import { ChartIcon, IconBox } from '../components/common/ResourceIcon';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { AddChartSelectItem } from '../components/DashboardTiles/TileForms/AddChartTilesModal';
import { HomepageContentPanel } from '../components/Home/HomepageContentPanel';
import PageSpinner from '../components/PageSpinner';
import PinnedAndFavoritesSection from '../components/PinnedAndFavoritesSection';
import SchedulersView from '../components/SchedulersView';
import { ResourceTypeFilter } from '../components/SchedulersView/filters/ResourceTypeFilter';
import { SettingsValidator } from '../components/SettingsValidator';
import { DataAppPickerModal } from '../ee/features/homepageBuilder/blocks/DataAppPickerModal';
import { RecentList } from '../ee/features/homepageBuilder/blocks/RecentBlock';
import {
    type ContentIconName,
    type ContentIconSet,
} from '../features/iconLab/contentIcons';
import { CONTENT_ICON_SETS } from '../features/iconLab/contentIconSets';
import {
    CONTENT_ICON_SET_KEYS,
    isContentIconSetKey,
    setContentIconSetKey,
    useContentIconSetKey,
    type ContentIconSetKey,
} from '../features/iconLab/contentIconSetStore';
import {
    ICON_BOX_STYLE_KEYS,
    isIconBoxStyleKey,
    setIconBoxStyleKey,
    useIconBoxStyleKey,
    type IconBoxStyleKey,
} from '../features/iconLab/iconBoxStyleStore';
import classes from '../features/iconLab/IconLab.module.css';
import OmnibarItem from '../features/omnibar/components/OmnibarItem';
import OmnibarPreview from '../features/omnibar/components/OmnibarPreview';
import useSearch from '../features/omnibar/hooks/useSearch';
import { ContentTypeFilter } from '../features/recentlyDeleted/components/ContentTypeFilter';
import RecentlyDeletedPage from '../features/recentlyDeleted/components/RecentlyDeletedPage';
import { type DeletedContentTypeFilter } from '../features/recentlyDeleted/types';
import { useFavorites } from '../hooks/favorites/useFavorites';
import { usePinnedItems } from '../hooks/pinning/usePinnedItems';
import {
    useMostPopularAndRecentlyUpdated,
    useProject,
} from '../hooks/useProject';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useAppColorScheme } from '../providers/ColorSchemeContext';
import { FavoritesProvider } from '../providers/Favorites/FavoritesProvider';
import { PinnedItemsProvider } from '../providers/PinnedItems/PinnedItemsProvider';
import { getProjectUrlIdentifier } from '../utils/projectUrl';

const SET_LABELS: Record<ContentIconSetKey, string> = {
    current: 'Current icons',
    a: 'New icons',
};

const BOX_LABELS: Record<IconBoxStyleKey, string> = {
    current: 'With box',
    none: 'No box',
};

const CHART_KIND_LABELS: Record<ChartKind, string> = {
    [ChartKind.TABLE]: 'Table',
    [ChartKind.VERTICAL_BAR]: 'Bar',
    [ChartKind.HORIZONTAL_BAR]: 'Horizontal bar',
    [ChartKind.LINE]: 'Line',
    [ChartKind.AREA]: 'Area',
    [ChartKind.MIXED]: 'Mixed',
    [ChartKind.SCATTER]: 'Scatter',
    [ChartKind.PIE]: 'Pie',
    [ChartKind.BIG_NUMBER]: 'Big number',
    [ChartKind.FUNNEL]: 'Funnel',
    [ChartKind.TREEMAP]: 'Treemap',
    [ChartKind.GAUGE]: 'Gauge',
    [ChartKind.MAP]: 'Map',
    [ChartKind.SANKEY]: 'Sankey',
    [ChartKind.CUSTOM]: 'Vega (legacy)',
    [ChartKind.DATA_APP_VIZ]: 'Custom chart type, no icon',
};

type IconRow = { name: ContentIconName; label: string; color: string };

const CHART_COLOR = 'blue.6';

const MATRIX_ROWS: IconRow[] = [
    { name: 'dashboard', label: 'Dashboard', color: 'green.6' },
    { name: 'space', label: 'Space', color: 'violet.6' },
    { name: 'dataApp', label: 'Data app', color: 'orange.6' },
    { name: 'document', label: 'Document', color: 'ldGray.6' },
    { name: 'table', label: 'Table', color: CHART_COLOR },
    { name: 'bar', label: 'Bar', color: CHART_COLOR },
    { name: 'line', label: 'Line', color: CHART_COLOR },
    { name: 'area', label: 'Area', color: CHART_COLOR },
    { name: 'mixed', label: 'Mixed', color: CHART_COLOR },
    { name: 'scatter', label: 'Scatter', color: CHART_COLOR },
    { name: 'pie', label: 'Pie', color: CHART_COLOR },
    { name: 'bigNumber', label: 'Big number', color: CHART_COLOR },
    { name: 'funnel', label: 'Funnel', color: CHART_COLOR },
    { name: 'treemap', label: 'Treemap', color: CHART_COLOR },
    { name: 'gauge', label: 'Gauge', color: CHART_COLOR },
    { name: 'map', label: 'Map', color: CHART_COLOR },
    { name: 'sankey', label: 'Sankey', color: CHART_COLOR },
    { name: 'custom', label: 'Vega (legacy)', color: CHART_COLOR },
    {
        name: 'dataAppViz',
        label: 'Custom chart type, no icon',
        color: CHART_COLOR,
    },
];

const SEARCH_QUERY = 'orders';

// One broken surface should not take the rest of the QA view with it.
const Section: FC<{ title: string; source: string; children: ReactNode }> = ({
    title,
    source,
    children,
}) => (
    <Stack gap="sm">
        <Stack gap={0}>
            <Title order={5}>{title}</Title>
            <Text fz="xs" c="dimmed" ff="monospace">
                {source}
            </Text>
        </Stack>
        <Sentry.ErrorBoundary
            fallback={
                <Text fz="sm" c="red">
                    This component failed to render here.
                </Text>
            }
        >
            {children}
        </Sentry.ErrorBoundary>
    </Stack>
);

const SearchResults: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data, isInitialLoading } = useSearch({
        projectUuid,
        query: SEARCH_QUERY,
        source: 'omnibar',
    });

    if (isInitialLoading || !data) {
        return (
            <Text fz="sm" c="dimmed">
                Searching for "{SEARCH_QUERY}"
            </Text>
        );
    }

    const items = [
        ...data.dashboards.slice(0, 3),
        ...data.savedCharts.slice(0, 5),
        ...data.tables.slice(0, 2),
        ...data.spaces.slice(0, 2),
        ...data.dataApps.slice(0, 1),
    ];

    return (
        <Box className={classes.search}>
            <Paper p="xs">
                {items.map((item) => (
                    <OmnibarItem
                        key={`${item.type}-${item.location.pathname}`}
                        item={item}
                        projectUuid={projectUuid}
                        canUserManageValidation={false}
                    />
                ))}
            </Paper>
            <Paper p="md">
                <OmnibarPreview item={data.savedCharts[0]} />
            </Paper>
        </Box>
    );
};

const MatrixCell: FC<{ icons: ContentIconSet; row: IconRow }> = ({
    icons,
    row,
}) => (
    <Group gap="md" wrap="nowrap">
        <MantineIcon icon={icons[row.name]} size={16} color={row.color} />
        <IconBox icon={icons[row.name]} color={row.color} />
        <MantineIcon icon={icons[row.name]} size={40} color={row.color} />
    </Group>
);

const IconLab: FC = () => {
    const setKey = useContentIconSetKey();
    const boxStyle = useIconBoxStyleKey();
    const { colorScheme, setColorSchemePreference } = useAppColorScheme();
    const [schedulerType, setSchedulerType] = useState<
        'all' | 'chart' | 'dashboard'
    >('all');
    const [deletedType, setDeletedType] =
        useState<DeletedContentTypeFilter>('all');
    const [isAppPickerOpen, setIsAppPickerOpen] = useState(false);

    const projectUuid = useProjectUuid();
    const project = useProject(projectUuid);
    const pinnedItems = usePinnedItems(
        projectUuid,
        project.data?.pinnedListUuid,
    );
    const favorites = useFavorites(projectUuid);
    const mostPopularAndRecentlyUpdated =
        useMostPopularAndRecentlyUpdated(projectUuid);

    if (!projectUuid || !project.data) {
        return <PageSpinner />;
    }

    const projectUrl = `/projects/${projectUuid}`;

    return (
        <Page withFixedContent withPaddedContent>
            <Stack gap="xl">
                <Paper className={classes.toolbar}>
                    <Stack gap={0}>
                        <Text fw={600}>Content icons: layout QA</Text>
                        <Text fz="xs" c="dimmed">
                            Every place that drew its icon in a box. Choices
                            stick in this browser and apply across the app.
                        </Text>
                    </Stack>
                    <Group gap="sm">
                        <SegmentedControl
                            aria-label="Icon set"
                            value={setKey}
                            onChange={(value) => {
                                if (isContentIconSetKey(value))
                                    setContentIconSetKey(value);
                            }}
                            data={CONTENT_ICON_SET_KEYS.map((key) => ({
                                value: key,
                                label: SET_LABELS[key],
                            }))}
                        />
                        <SegmentedControl
                            aria-label="Icon box"
                            value={boxStyle}
                            onChange={(value) => {
                                if (isIconBoxStyleKey(value))
                                    setIconBoxStyleKey(value);
                            }}
                            data={ICON_BOX_STYLE_KEYS.map((key) => ({
                                value: key,
                                label: BOX_LABELS[key],
                            }))}
                        />
                        <SegmentedControl
                            aria-label="Color scheme"
                            value={colorScheme === 'dark' ? 'dark' : 'light'}
                            onChange={(value) =>
                                setColorSchemePreference(
                                    value === 'dark' ? 'dark' : 'light',
                                )
                            }
                            data={[
                                { value: 'light', label: 'Light' },
                                { value: 'dark', label: 'Dark' },
                            ]}
                        />
                    </Group>
                </Paper>

                <FavoritesProvider projectUuid={projectUuid}>
                    <Stack gap="xl">
                        <Title order={3}>Home</Title>
                        <Section
                            title="1. Pinned cards and favourites"
                            source="ResourceViewGrid*Item via PinnedAndFavoritesSection"
                        >
                            <PinnedItemsProvider
                                organizationUuid={project.data.organizationUuid}
                                projectUuid={projectUuid}
                                pinnedListUuid={
                                    project.data.pinnedListUuid || ''
                                }
                                allowDelete={false}
                            >
                                <PinnedAndFavoritesSection
                                    pinnedItems={pinnedItems.data ?? []}
                                    favoriteItems={favorites.data ?? []}
                                    pinnedIsEnabled
                                />
                            </PinnedItemsProvider>
                        </Section>

                        <Section
                            title="2. Most popular and recently updated"
                            source="ResourceViewList via HomepageContentPanel"
                        >
                            <HomepageContentPanel
                                data={mostPopularAndRecentlyUpdated.data}
                                projectUuid={projectUuid}
                                projectUrlIdentifier={getProjectUrlIdentifier(
                                    project.data,
                                )}
                            />
                        </Section>

                        <Section
                            title="3. Homepage builder: recent list"
                            source="RecentBlock"
                        >
                            <RecentList projectUuid={projectUuid} />
                        </Section>

                        <Section
                            title="4. Homepage builder: data app picker"
                            source="DataAppPickerModal"
                        >
                            <Group>
                                <Button
                                    variant="default"
                                    onClick={() => setIsAppPickerOpen(true)}
                                >
                                    Open the picker
                                </Button>
                            </Group>
                            <DataAppPickerModal
                                opened={isAppPickerOpen}
                                onClose={() => setIsAppPickerOpen(false)}
                                projectUuid={projectUuid}
                                existingAppUuids={[]}
                                onAdd={() => setIsAppPickerOpen(false)}
                            />
                        </Section>

                        <Title order={3}>Browse</Title>
                        <Section
                            title="5. Content table"
                            source="InfiniteResourceTableColumnName: all dashboards, charts, data apps, documents, inside a space"
                        >
                            <InfiniteResourceTable
                                filters={{
                                    projectUuid,
                                    contentTypes: [
                                        ContentType.DASHBOARD,
                                        ContentType.CHART,
                                        ContentType.DATA_APP,
                                        ContentType.DOCUMENT,
                                    ],
                                }}
                                contentTypeFilter={{
                                    defaultValue: undefined,
                                    options: [
                                        ContentType.DASHBOARD,
                                        ContentType.CHART,
                                        ContentType.DATA_APP,
                                        ContentType.DOCUMENT,
                                    ],
                                }}
                            />
                        </Section>

                        <Section
                            title="6. Spaces table"
                            source="InfiniteResourceTableColumnName (spaces)"
                        >
                            <InfiniteResourceTable
                                filters={{
                                    projectUuid,
                                    spaceUuids: [],
                                    contentTypes: [ContentType.SPACE],
                                }}
                                contentTypeFilter={{
                                    defaultValue: ContentType.SPACE,
                                    options: [],
                                }}
                                enableBottomToolbar={false}
                                enableRowSelection={false}
                            />
                        </Section>
                    </Stack>
                </FavoritesProvider>

                <Title order={3}>Search</Title>
                <Section
                    title={`7. Search results and preview, query "${SEARCH_QUERY}"`}
                    source="OmnibarItem, OmnibarPreview"
                >
                    <SearchResults projectUuid={projectUuid} />
                </Section>

                <Title order={3}>Pickers</Title>
                <Section
                    title="8. Add saved charts to a dashboard: option rows"
                    source="AddChartTilesModal select item, shown outside its dropdown"
                >
                    <Paper p="sm" w={360}>
                        <Stack gap="xs">
                            {[
                                ChartKind.VERTICAL_BAR,
                                ChartKind.LINE,
                                ChartKind.TABLE,
                                ChartKind.BIG_NUMBER,
                                ChartKind.PIE,
                            ].map((kind) => (
                                <AddChartSelectItem
                                    key={kind}
                                    label={`${CHART_KIND_LABELS[kind]} chart example`}
                                    chartKind={kind}
                                />
                            ))}
                        </Stack>
                    </Paper>
                </Section>

                <Section title="9. Every chart kind" source="ChartIcon">
                    <Paper p="md">
                        <Box className={classes.kinds}>
                            {Object.values(ChartKind).map((kind) => (
                                <Group key={kind} gap="sm" wrap="nowrap">
                                    <ChartIcon chartKind={kind} />
                                    <Text fz="sm" truncate>
                                        {CHART_KIND_LABELS[kind]}
                                    </Text>
                                </Group>
                            ))}
                        </Box>
                    </Paper>
                </Section>

                <Title order={3}>Settings</Title>
                <Section
                    title="10. Scheduled deliveries"
                    source="SchedulersView"
                >
                    <SchedulersView projectUuid={projectUuid} />
                </Section>

                <Section title="11. Validator" source="SettingsValidator">
                    <SettingsValidator projectUuid={projectUuid} />
                </Section>

                <Section
                    title="12. Recently deleted"
                    source="RecentlyDeletedPage"
                >
                    <RecentlyDeletedPage projectUuid={projectUuid} />
                </Section>

                <Title order={3}>Not on this page</Title>
                <Section
                    title="Boxed icons that need their own page or data"
                    source="the selectors carry over, open in a new tab"
                >
                    <Paper p="md">
                        <List fz="sm" spacing={6}>
                            <List.Item>
                                Add saved charts modal in place: edit a
                                dashboard, Add tile, Saved chart
                            </List.Item>
                            <List.Item>
                                <Anchor
                                    component={Link}
                                    to={`${projectUrl}/apps/generate`}
                                    target="_blank"
                                >
                                    Data app builder
                                </Anchor>
                                : the resource picker (AppResourcePicker)
                            </List.Item>
                            <List.Item>
                                <Anchor
                                    component={Link}
                                    to={`${projectUrl}/chart-types/new`}
                                    target="_blank"
                                >
                                    Custom chart type builder
                                </Anchor>
                                : the data source picker (DataSourcePicker)
                            </List.Item>
                            <List.Item>
                                Content review: request list, request page,
                                request modal. Needs review requests to exist
                            </List.Item>
                            <List.Item>
                                Homepage builder: collection block and content
                                cards. Needs a published homepage
                            </List.Item>
                            <List.Item>
                                Pre-aggregate materialization drawer. Needs
                                pre-aggregates on the project
                            </List.Item>
                        </List>
                    </Paper>
                </Section>

                <Title order={3}>Bare icons, for the new set only</Title>
                <Section
                    title="Type filters"
                    source="ResourceTypeFilter (schedulers), ContentTypeFilter (recently deleted)"
                >
                    <Paper p="md">
                        <Group gap="xl">
                            <ResourceTypeFilter
                                selectedResourceType={schedulerType}
                                setSelectedResourceType={(value) =>
                                    setSchedulerType(value ?? 'all')
                                }
                            />
                            <Group gap="sm">
                                <ContentTypeFilter
                                    selectedContentType={deletedType}
                                    setSelectedContentType={setDeletedType}
                                />
                            </Group>
                        </Group>
                    </Paper>
                </Section>

                <Section
                    title="Current vs new"
                    source="bare 16px, list slot, bare 40px"
                >
                    <Paper className={classes.matrix}>
                        <Box className={classes.matrixHead}>
                            <span />
                            {CONTENT_ICON_SET_KEYS.map((key) => (
                                <Text key={key} fz="sm" fw={600}>
                                    {SET_LABELS[key]}
                                </Text>
                            ))}
                        </Box>
                        {MATRIX_ROWS.map((row) => (
                            <Box key={row.name} className={classes.matrixRow}>
                                <Text fz="sm">{row.label}</Text>
                                {CONTENT_ICON_SET_KEYS.map((key) => (
                                    <MatrixCell
                                        key={key}
                                        icons={CONTENT_ICON_SETS[key]}
                                        row={row}
                                    />
                                ))}
                            </Box>
                        ))}
                    </Paper>
                </Section>
            </Stack>
        </Page>
    );
};

export default IconLab;
