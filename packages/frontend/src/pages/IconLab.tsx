import { ChartKind, ContentType } from '@lightdash/common';
import {
    Box,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useState, type FC, type ReactNode } from 'react';
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
    setContentIconSetKey,
    useContentIconSetKey,
    type ContentIconSetKey,
} from '../features/iconLab/contentIconSetStore';
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
    b: 'B · Accent',
    c: 'C · Solid',
};

const isSetKey = (value: string): value is ContentIconSetKey =>
    CONTENT_ICON_SET_KEYS.some((key) => key === value);

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
    [ChartKind.CUSTOM]: 'Custom',
    [ChartKind.DATA_APP_VIZ]: 'Data app viz',
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
    { name: 'custom', label: 'Custom', color: CHART_COLOR },
    { name: 'dataAppViz', label: 'Data app viz', color: CHART_COLOR },
];

const Section: FC<{ title: string; source: string; children: ReactNode }> = ({
    title,
    source,
    children,
}) => (
    <Stack gap="sm">
        <Stack gap={0}>
            <Title order={4}>{title}</Title>
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

    return (
        <Page withFixedContent withPaddedContent>
            <Stack gap="xl">
                <Paper className={classes.toolbar}>
                    <Stack gap={0}>
                        <Text fw={600}>Content icon lab</Text>
                        <Text fz="xs" c="dimmed">
                            The choice sticks in this browser, so the rest of
                            the app follows it too.
                        </Text>
                    </Stack>
                    <Group gap="sm">
                        <SegmentedControl
                            aria-label="Icon set"
                            value={setKey}
                            onChange={(value) => {
                                if (isSetKey(value))
                                    setContentIconSetKey(value);
                            }}
                            data={CONTENT_ICON_SET_KEYS.map((key) => ({
                                value: key,
                                label: SET_LABELS[key],
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

                <Text fz="sm" c="dimmed">
                    The nav bar above is the real one: open Browse and New to
                    see the menus in the selected set.
                </Text>

                <FavoritesProvider projectUuid={projectUuid}>
                    <Stack gap="xl">
                        <Section
                            title="Homepage: pinned, favourites, most popular"
                            source="PinnedAndFavoritesSection, HomepageContentPanel"
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
                            <HomepageContentPanel
                                data={mostPopularAndRecentlyUpdated.data}
                                projectUuid={projectUuid}
                                projectUrlIdentifier={getProjectUrlIdentifier(
                                    project.data,
                                )}
                            />
                        </Section>

                        <Section
                            title="Content table with type filters"
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
                            title="Spaces"
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
                    title="All sets side by side"
                    source="16px, 32px box, 40px"
                >
                    <Paper className={classes.matrix}>
                        <Box className={classes.matrixHead}>
                            <span />
                            {CONTENT_ICON_SET_KEYS.map((key) => (
                                <Text
                                    key={key}
                                    fz="sm"
                                    fw={600}
                                    c={key === setKey ? undefined : 'dimmed'}
                                >
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
