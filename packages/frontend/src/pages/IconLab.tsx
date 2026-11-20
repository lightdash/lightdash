import { ChartKind, ContentType } from '@lightdash/common';
import {
    Anchor,
    Box,
    Group,
    List,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import { ChartIcon, IconBox } from '../components/common/ResourceIcon';
import InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { HomepageContentPanel } from '../components/Home/HomepageContentPanel';
import PageSpinner from '../components/PageSpinner';
import PinnedAndFavoritesSection from '../components/PinnedAndFavoritesSection';
import { ResourceTypeFilter } from '../components/SchedulersView/filters/ResourceTypeFilter';
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
import { ContentTypeFilter } from '../features/recentlyDeleted/components/ContentTypeFilter';
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
    current: 'Current',
    a: 'A · Outline',
};

const BOX_LABELS: Record<IconBoxStyleKey, string> = {
    current: 'Current box',
    square: 'Tighter radius',
    tinted: 'Type-colour tint',
    none: 'No box',
    compact: 'No box, compact',
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
        {children}
    </Stack>
);

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

    const settingsUrl = `/generalSettings/projectManagement/${projectUuid}`;

    return (
        <Page withFixedContent withPaddedContent>
            <Stack gap="xl">
                <Paper className={classes.toolbar}>
                    <Stack gap={0}>
                        <Text fw={600}>Content icon lab</Text>
                        <Text fz="xs" c="dimmed">
                            Choices stick in this browser, so the rest of the
                            app follows them too.
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

                <Stack gap="lg">
                    <Stack gap={2}>
                        <Title order={3}>Where the icon box is used</Title>
                        <Text fz="sm" c="dimmed">
                            Everything in this group draws its icon through
                            IconBox, so it follows the box selector.
                        </Text>
                    </Stack>

                    <FavoritesProvider projectUuid={projectUuid}>
                        <Stack gap="xl">
                            <Section
                                title="Homepage: pinned cards, favourites"
                                source="PinnedAndFavoritesSection"
                            >
                                <PinnedItemsProvider
                                    organizationUuid={
                                        project.data.organizationUuid
                                    }
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
                                title="Homepage: most popular, recently updated"
                                source="HomepageContentPanel"
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
                                title="Content table"
                                source="InfiniteResourceTable"
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
                                title="Spaces table"
                                source="InfiniteResourceTable (spaces)"
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

                    <Section title="Every chart kind" source="ChartIcon">
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

                    <Section
                        title="Also boxed, on their own pages"
                        source="open in a new tab, the selectors carry over"
                    >
                        <Paper p="md">
                            <List fz="sm" spacing={6}>
                                <List.Item>
                                    Search results: press Cmd or Ctrl + K on
                                    this page
                                </List.Item>
                                <List.Item>
                                    <Anchor
                                        component={Link}
                                        to={`${settingsUrl}/scheduledDeliveries`}
                                        target="_blank"
                                    >
                                        Scheduled deliveries list
                                    </Anchor>
                                </List.Item>
                                <List.Item>
                                    <Anchor
                                        component={Link}
                                        to={`${settingsUrl}/recentlyDeleted`}
                                        target="_blank"
                                    >
                                        Recently deleted
                                    </Anchor>
                                </List.Item>
                                <List.Item>
                                    <Anchor
                                        component={Link}
                                        to={`${settingsUrl}/validator`}
                                        target="_blank"
                                    >
                                        Validator table
                                    </Anchor>
                                </List.Item>
                                <List.Item>
                                    Add saved charts modal: edit a dashboard,
                                    Add tile, Saved chart
                                </List.Item>
                                <List.Item>
                                    Not linked: content review pages, homepage
                                    builder blocks, data app and chart type
                                    source pickers
                                </List.Item>
                            </List>
                        </Paper>
                    </Section>
                </Stack>

                <Stack gap="lg">
                    <Stack gap={2}>
                        <Title order={3}>Where the icon is bare</Title>
                        <Text fz="sm" c="dimmed">
                            No box here today, so only the set selector applies.
                            The nav bar above is the real one: open Browse and
                            New.
                        </Text>
                    </Stack>

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
                        title="One colour list"
                        source="mock sidebar list, 16px icons, no type colour"
                    >
                        <Box className={classes.sidebars}>
                            {[
                                MATRIX_ROWS.slice(0, 10),
                                MATRIX_ROWS.slice(10),
                            ].map((rows) => (
                                <Paper
                                    key={rows[0].name}
                                    className={classes.sidebar}
                                >
                                    {rows.map((row) => (
                                        <Group
                                            key={row.name}
                                            gap="sm"
                                            wrap="nowrap"
                                            className={classes.sidebarRow}
                                        >
                                            <MantineIcon
                                                icon={
                                                    CONTENT_ICON_SETS[setKey][
                                                        row.name
                                                    ]
                                                }
                                                size={16}
                                            />
                                            <Text fz="sm">{row.label}</Text>
                                        </Group>
                                    ))}
                                </Paper>
                            ))}
                        </Box>
                    </Section>
                </Stack>

                <Stack gap="lg">
                    <Title order={3}>Current vs A</Title>
                    <Section
                        title="Side by side"
                        source="bare 16px, boxed 32px, bare 40px"
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
                                <Box
                                    key={row.name}
                                    className={classes.matrixRow}
                                >
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
            </Stack>
        </Page>
    );
};

export default IconLab;
