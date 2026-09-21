import {
    ChartSourceType,
    isSummaryExploreError,
    type ChartContent,
    type DataAppVizField,
    type SavedChart,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    Loader,
    Menu,
    ScrollArea,
    Text,
    TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconCheck,
    IconChevronDown,
    IconDatabase,
    IconSearch,
    IconSparkles,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useChartSummariesV2 } from '../../../hooks/useChartSummariesV2';
import { useExplores } from '../../../hooks/useExplores';
import { useSavedQuery } from '../../../hooks/useSavedQuery';
import {
    autoMapDataAppVizFieldsFromPools,
    dataAppVizFieldPoolsFromMetricQuery,
} from '../utils/autoMapDataAppVizFields';
import {
    checkChartTypeFit,
    chartTypeFitSummary,
} from '../utils/chartTypePreviewFit';
import { countLabel } from '../utils/countLabel';
import classes from './PreviewDataPill.module.css';
import { type PreviewDataSelection } from './previewDataTypes';

const CHART_PAGE_SIZE = 10;

type Menus = 'root' | 'savedCharts' | 'explores';

/** One searchable chart, with the fit its query would have against the
 *  version on screen. The chart's definition is metadata; reading it never
 *  runs the chart's query. */
const SavedChartOption: FC<{
    chart: ChartContent;
    projectUuid: string;
    exploreLabels: Record<string, string>;
    fields: DataAppVizField[];
    onSelect: (chart: SavedChart) => void;
}> = ({ chart, projectUuid, exploreLabels, fields, onSelect }) => {
    const definition = useSavedQuery({
        uuidOrSlug: chart.uuid,
        projectUuid,
    });
    const metricQuery = definition.data?.metricQuery ?? null;
    const summary = metricQuery
        ? `${exploreLabels[metricQuery.exploreName] ?? metricQuery.exploreName} · ${countLabel(
              metricQuery.dimensions.length,
              'dimension',
          )}, ${countLabel(metricQuery.metrics.length, 'metric')}`
        : 'Reading the chart…';
    const fit = useMemo(() => {
        if (!metricQuery || fields.length === 0) return null;
        const pools = dataAppVizFieldPoolsFromMetricQuery(metricQuery);
        return chartTypeFitSummary(
            checkChartTypeFit(
                fields,
                autoMapDataAppVizFieldsFromPools(fields, pools),
                pools,
            ),
            pools,
        );
    }, [metricQuery, fields]);

    return (
        <Menu.Item
            disabled={definition.data === undefined}
            onClick={() => definition.data && onSelect(definition.data)}
            rightSection={
                fit ? (
                    <Badge
                        size="xs"
                        variant="light"
                        color={fit === 'Fits' ? 'green' : 'ldGray'}
                    >
                        {fit}
                    </Badge>
                ) : null
            }
        >
            <Text size="sm" fw={500} lineClamp={1}>
                {chart.name}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={1}>
                {summary}
            </Text>
        </Menu.Item>
    );
};

type Props = {
    projectUuid: string;
    selection: PreviewDataSelection;
    /** The chosen explore's display name; null while sample data is selected. */
    exploreLabel: string | null;
    boundFieldCount: number;
    /** A query is selected but has not been run against this binding. */
    isNotRun: boolean;
    /** The version on screen declares these inputs; empty before a first build. */
    fields: DataAppVizField[];
    disabled: boolean;
    opened: boolean;
    /** Chart Studio finds the data from the prompt; null without Ambient AI. */
    onSelectSuggest: (() => void) | null;
    /** Suggesting is what the pill shows, with nothing chosen yet. */
    isSuggestSelected: boolean;
    onOpenedChange: (opened: boolean) => void;
    onSelectSample: () => void;
    onSelectSavedChart: (chart: SavedChart) => void;
    onSelectExplore: (exploreName: string) => void;
};

/**
 * The composer's data selector: what the preview is drawn from, and the one
 * place to change it. Everything the menu reads is metadata — picking a chart
 * or an explore never runs a warehouse query.
 */
const PreviewDataPill: FC<Props> = ({
    projectUuid,
    selection,
    exploreLabel,
    boundFieldCount,
    isNotRun,
    fields,
    disabled,
    opened,
    onSelectSuggest,
    isSuggestSelected,
    onOpenedChange,
    onSelectSample,
    onSelectSavedChart,
    onSelectExplore,
}) => {
    const [openMenu, setOpenMenu] = useState<Menus>('root');
    const [chartSearch, setChartSearch] = useState('');
    const [debouncedChartSearch] = useDebouncedValue(chartSearch, 300);
    const [exploreSearch, setExploreSearch] = useState('');

    const charts = useChartSummariesV2(
        {
            projectUuid,
            page: 1,
            pageSize: CHART_PAGE_SIZE,
            search: debouncedChartSearch,
        },
        {
            keepPreviousData: true,
            enabled: opened && openMenu === 'savedCharts',
        },
    );
    const explores = useExplores(projectUuid, true, false, {
        enabled: opened,
    });

    const exploreOptions = useMemo(
        () =>
            (explores.data ?? [])
                .filter((explore) => !isSummaryExploreError(explore))
                .map((explore) => ({
                    name: explore.name,
                    label: explore.label,
                })),
        [explores.data],
    );
    const exploreLabels = useMemo(
        () =>
            exploreOptions.reduce<Record<string, string>>((acc, explore) => {
                acc[explore.name] = explore.label;
                return acc;
            }, {}),
        [exploreOptions],
    );
    const filteredExplores = useMemo(() => {
        const needle = exploreSearch.trim().toLowerCase();
        if (needle === '') return exploreOptions;
        return exploreOptions.filter((explore) =>
            explore.label.toLowerCase().includes(needle),
        );
    }, [exploreOptions, exploreSearch]);

    const chartOptions = useMemo(
        () =>
            (charts.data?.pages.flatMap((page) => page.data) ?? []).filter(
                (chart) => chart.source === ChartSourceType.DBT_EXPLORE,
            ),
        [charts.data?.pages],
    );

    const hasDeclaredInputs = fields.length > 0;
    const label =
        selection.kind === 'sample'
            ? isSuggestSelected
                ? 'Data: suggest for me'
                : 'Data: Sample data'
            : `${exploreLabel ?? selection.exploreName}, ${countLabel(
                  boundFieldCount,
                  'field',
              )}${isNotRun ? ', not run' : ''}`;

    const select = (run: () => void) => {
        run();
        setOpenMenu('root');
        onOpenedChange(false);
    };

    return (
        <Menu
            opened={opened}
            onChange={onOpenedChange}
            onDismiss={() => onOpenedChange(false)}
            position="top-start"
            offset={8}
            width={320}
            closeOnItemClick={false}
        >
            <Menu.Target>
                <Button
                    variant="subtle"
                    size="xs"
                    radius="xl"
                    color="gray"
                    h="auto"
                    py={6}
                    className={classes.trigger}
                    data-selected={selection.kind === 'query'}
                    data-suggest={isSuggestSelected || undefined}
                    disabled={disabled}
                    onClick={() => onOpenedChange(!opened)}
                    leftSection={
                        <MantineIcon
                            icon={
                                isSuggestSelected ? IconSparkles : IconDatabase
                            }
                            size={14}
                        />
                    }
                    rightSection={
                        <MantineIcon icon={IconChevronDown} size={12} />
                    }
                    aria-label={`Preview data: ${label}`}
                >
                    <Text span size="xs" fw={600} lh={1.2} lineClamp={1}>
                        {label}
                    </Text>
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label>Preview data</Menu.Label>
                {onSelectSuggest && (
                    <Menu.Item
                        onClick={() => select(onSelectSuggest)}
                        aria-current={isSuggestSelected}
                        leftSection={
                            <MantineIcon
                                icon={IconSparkles}
                                size={14}
                                color="indigo.5"
                            />
                        }
                        rightSection={
                            isSuggestSelected ? (
                                <MantineIcon icon={IconCheck} size={14} />
                            ) : null
                        }
                    >
                        <Text size="sm" fw={500}>
                            Suggest for me
                        </Text>
                        <Text size="xs" c="dimmed">
                            Finds an explore and fields from your prompt
                        </Text>
                    </Menu.Item>
                )}
                <Menu.Item
                    onClick={() =>
                        setOpenMenu(
                            openMenu === 'savedCharts' ? 'root' : 'savedCharts',
                        )
                    }
                    aria-expanded={openMenu === 'savedCharts'}
                >
                    <Text size="sm" fw={500}>
                        Use a saved chart
                    </Text>
                    <Text size="xs" c="dimmed">
                        Build on the query behind a chart
                    </Text>
                </Menu.Item>
                <Menu.Item
                    disabled={!hasDeclaredInputs}
                    onClick={() =>
                        setOpenMenu(
                            openMenu === 'explores' ? 'root' : 'explores',
                        )
                    }
                    aria-expanded={openMenu === 'explores'}
                >
                    <Text size="sm" fw={500}>
                        Pick an explore and fields
                    </Text>
                    <Text size="xs" c="dimmed">
                        {hasDeclaredInputs
                            ? 'Bind each chart input yourself'
                            : 'Available once a build declares chart inputs'}
                    </Text>
                </Menu.Item>
                <Menu.Item
                    onClick={() => select(onSelectSample)}
                    aria-current={selection.kind === 'sample'}
                    rightSection={
                        selection.kind === 'sample' ? (
                            <MantineIcon icon={IconCheck} size={14} />
                        ) : null
                    }
                >
                    <Text size="sm" fw={500}>
                        Sample data
                    </Text>
                    <Text size="xs" c="dimmed">
                        Made-up rows, no warehouse query
                    </Text>
                </Menu.Item>

                {openMenu === 'savedCharts' && (
                    <>
                        <Menu.Divider />
                        <TextInput
                            size="xs"
                            m="xs"
                            placeholder="Search saved charts"
                            leftSection={
                                <MantineIcon icon={IconSearch} size={14} />
                            }
                            rightSection={
                                charts.isFetching ? (
                                    <Loader size={14} />
                                ) : undefined
                            }
                            value={chartSearch}
                            onChange={(event) =>
                                setChartSearch(event.currentTarget.value)
                            }
                        />
                        <ScrollArea.Autosize mah={260} type="scroll">
                            {chartOptions.length === 0 && !charts.isFetching ? (
                                <Text size="xs" c="dimmed" ta="center" p="sm">
                                    No charts found
                                </Text>
                            ) : (
                                chartOptions.map((chart) => (
                                    <SavedChartOption
                                        key={chart.uuid}
                                        chart={chart}
                                        projectUuid={projectUuid}
                                        exploreLabels={exploreLabels}
                                        fields={fields}
                                        onSelect={(saved) =>
                                            select(() =>
                                                onSelectSavedChart(saved),
                                            )
                                        }
                                    />
                                ))
                            )}
                        </ScrollArea.Autosize>
                    </>
                )}

                {openMenu === 'explores' && hasDeclaredInputs && (
                    <>
                        <Menu.Divider />
                        <TextInput
                            size="xs"
                            m="xs"
                            placeholder="Search explores"
                            leftSection={
                                <MantineIcon icon={IconSearch} size={14} />
                            }
                            value={exploreSearch}
                            onChange={(event) =>
                                setExploreSearch(event.currentTarget.value)
                            }
                        />
                        <ScrollArea.Autosize mah={260} type="scroll">
                            {filteredExplores.length === 0 ? (
                                <Text size="xs" c="dimmed" ta="center" p="sm">
                                    No explores found
                                </Text>
                            ) : (
                                filteredExplores.map((explore) => (
                                    <Menu.Item
                                        key={explore.name}
                                        onClick={() =>
                                            select(() =>
                                                onSelectExplore(explore.name),
                                            )
                                        }
                                        aria-current={
                                            selection.kind === 'query' &&
                                            selection.exploreName ===
                                                explore.name
                                        }
                                        rightSection={
                                            selection.kind === 'query' &&
                                            selection.exploreName ===
                                                explore.name ? (
                                                <MantineIcon
                                                    icon={IconCheck}
                                                    size={14}
                                                />
                                            ) : null
                                        }
                                    >
                                        <Text size="sm">{explore.label}</Text>
                                    </Menu.Item>
                                ))
                            )}
                        </ScrollArea.Autosize>
                    </>
                )}
                {explores.isInitialLoading && openMenu === 'explores' && (
                    <Group justify="center" p="sm">
                        <Loader size="sm" />
                    </Group>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default PreviewDataPill;
