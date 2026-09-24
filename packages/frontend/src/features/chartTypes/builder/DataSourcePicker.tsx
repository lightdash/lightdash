import {
    ChartKind,
    isSummaryExploreError,
    type ChartContent,
    type SummaryExplore,
} from '@lightdash/common';
import {
    Box,
    Combobox,
    Group,
    Loader,
    ScrollArea,
    Stack,
    Text,
    useCombobox,
    type ComboboxStore,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconCheck,
    IconFlask,
    IconSearch,
    IconSparkles,
    IconTable,
} from '@tabler/icons-react';
import uniqBy from 'lodash/uniqBy';
import {
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
    type ClipboardEvent,
    type FC,
    type ReactNode,
    type Ref,
} from 'react';
import InlineErrorState from '../../../components/common/InlineErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import { ChartIcon } from '../../../components/common/ResourceIcon';
import { useSuggestedChartTypeExplore } from '../../../ee/features/ambientAi/hooks/useChartTypeSuggestions';
import { useChartSummariesV2 } from '../../../hooks/useChartSummariesV2';
import { useExplores } from '../../../hooks/useExplores';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import scrollAreaClasses from '../../../styles/ScrollArea.module.css';
import { useAttachResourceLink } from '../../apps/hooks/useAttachResourceLink';
import classes from './DataSourcePicker.module.css';
import { type ExploreSourceControls } from './exploreSource';
import { type SavedChartSourceControls } from './savedChartSource';

type Props = {
    /** The control the picker hangs off. */
    children: ReactNode;
    opened: boolean;
    onOpenedChange: (opened: boolean) => void;
    savedChartSource: SavedChartSourceControls | null;
    exploreSource: ExploreSourceControls | null;
    position: 'bottom' | 'bottom-end' | 'top-start';
    /** 'target' spans the anchor (the sidebar tile); a number is a fixed dropdown width. */
    width: 'target' | number;
};

type PickerBodyHandle = { submit: (value: string) => void };

type BodyProps = Omit<
    Props,
    'children' | 'opened' | 'position' | 'width' | 'onOpenedChange'
> & {
    combobox: ComboboxStore;
    onClose: () => void;
    ref: Ref<PickerBodyHandle>;
};

type TableGroup = { label: string | null; explores: SummaryExplore[] };

const PAGE_SIZE = 25;
const LOAD_MORE_THRESHOLD = 80;
const TABLE_ROW_CAP = 100;
const TABLE_PREFIX = 'table:';
const CHART_PREFIX = 'chart:';
const SUGGESTED_TABLE_PREFIX = 'suggested-table:';
const SAMPLE_VALUE = 'sample';

const noop = () => {};

const PickerOption: FC<{
    value: string;
    isAttached: boolean;
    icon: ReactNode;
    label: string;
}> = ({ value, isAttached, icon, label }) => (
    <Combobox.Option
        value={value}
        active={isAttached}
        aria-selected={isAttached}
        className={classes.row}
    >
        {icon}
        <Text fz="xs" fw={500} truncate flex={1}>
            {label}
        </Text>
        {isAttached && (
            <Box className={classes.selectedIcon}>
                <MantineIcon icon={IconCheck} size={14} />
            </Box>
        )}
    </Combobox.Option>
);

const PickerBody: FC<BodyProps> = ({
    savedChartSource,
    exploreSource,
    combobox,
    onClose,
    ref,
}) => {
    const projectUuid = useProjectUuid();
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 250);
    const viewportRef = useRef<HTMLDivElement>(null);
    const hasScrolledToAttached = useRef(false);

    const exploresQuery = useExplores(projectUuid, true, false, {
        enabled: exploreSource !== null && Boolean(projectUuid),
    });
    // Asked only once the picker opens: the body mounts with the dropdown.
    const tableSuggestion = useSuggestedChartTypeExplore(
        projectUuid,
        exploreSource?.suggestTable ?? null,
    );
    const chartsQuery = useChartSummariesV2(
        { projectUuid, page: 1, pageSize: PAGE_SIZE, search: debouncedSearch },
        { keepPreviousData: true, enabled: savedChartSource !== null },
    );
    const {
        data: chartPages,
        hasNextPage,
        isFetching: isFetchingCharts,
        fetchNextPage,
    } = chartsQuery;
    const exploresError =
        exploreSource !== null && exploresQuery.isError
            ? {
                  message: 'Couldn’t load your tables.',
                  retry: exploresQuery.refetch,
              }
            : null;
    const chartsError =
        savedChartSource !== null && chartsQuery.isError
            ? {
                  message: 'Couldn’t load your saved charts.',
                  retry: chartsQuery.refetch,
              }
            : null;

    const needle = search.trim().toLowerCase();
    const attachedExploreName = exploreSource?.attached?.name ?? null;
    const attachedChartUuid = savedChartSource?.attached?.uuid ?? null;
    const attachedSource = savedChartSource?.attached
        ? savedChartSource
        : exploreSource?.attached
          ? exploreSource
          : null;

    const matchingExplores = useMemo<SummaryExplore[]>(() => {
        if (!exploreSource) return [];
        return (exploresQuery.data ?? [])
            .filter((explore) => !isSummaryExploreError(explore))
            .filter(
                (explore) =>
                    needle === '' ||
                    explore.label.toLowerCase().includes(needle) ||
                    explore.name.toLowerCase().includes(needle),
            )
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [exploreSource, exploresQuery.data, needle]);

    const suggestedExplore = useMemo(() => {
        if (
            !tableSuggestion ||
            tableSuggestion.exploreName === attachedExploreName
        ) {
            return null;
        }
        const explore = matchingExplores.find(
            (candidate) => candidate.name === tableSuggestion.exploreName,
        );
        return explore ? { explore, reason: tableSuggestion.reason } : null;
    }, [tableSuggestion, attachedExploreName, matchingExplores]);

    // Rendering is capped; the attached table always renders so it stays checked.
    const { tableGroups, hiddenTableCount } = useMemo(() => {
        const grouped = new Map<string, SummaryExplore[]>();
        const ungrouped: SummaryExplore[] = [];
        matchingExplores.forEach((explore) => {
            if (!explore.groupLabel) {
                ungrouped.push(explore);
                return;
            }
            grouped.set(explore.groupLabel, [
                ...(grouped.get(explore.groupLabel) ?? []),
                explore,
            ]);
        });
        const allGroups: TableGroup[] = [
            ...(ungrouped.length > 0
                ? [{ label: null, explores: ungrouped }]
                : []),
            ...[...grouped.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([label, explores]) => ({ label, explores })),
        ];
        const ordered = allGroups.flatMap((group) => group.explores);
        const rendered = new Set(
            ordered.slice(0, TABLE_ROW_CAP).map((explore) => explore.name),
        );
        if (
            attachedExploreName !== null &&
            ordered.some((explore) => explore.name === attachedExploreName)
        ) {
            rendered.add(attachedExploreName);
        }
        return {
            tableGroups: allGroups
                .map((group) => ({
                    label: group.label,
                    explores: group.explores.filter((explore) =>
                        rendered.has(explore.name),
                    ),
                }))
                .filter((group) => group.explores.length > 0),
            hiddenTableCount: ordered.length - rendered.size,
        };
    }, [matchingExplores, attachedExploreName]);

    const charts = useMemo(
        () =>
            savedChartSource
                ? uniqBy(
                      chartPages?.pages.flatMap((page) => page.data) ?? [],
                      'uuid',
                  )
                : [],
        [savedChartSource, chartPages?.pages],
    );
    const chartGroups = useMemo(() => {
        const groups = new Map<string, ChartContent[]>();
        charts.forEach((chart) => {
            groups.set(chart.space.name, [
                ...(groups.get(chart.space.name) ?? []),
                chart,
            ]);
        });
        return [...groups.entries()];
    }, [charts]);
    const chartTotal = chartPages?.pages[0]?.pagination?.totalResults ?? null;

    const pickExplore = useCallback(
        (explore: SummaryExplore) => {
            if (exploreSource && explore.name !== attachedExploreName) {
                exploreSource.attach({
                    name: explore.name,
                    label: explore.label,
                });
            }
            onClose();
        },
        [exploreSource, attachedExploreName, onClose],
    );
    const pickChart = useCallback(
        (chart: { uuid: string; name: string }) => {
            if (savedChartSource && chart.uuid !== attachedChartUuid) {
                savedChartSource.attach({ uuid: chart.uuid, name: chart.name });
            }
            onClose();
        },
        [savedChartSource, attachedChartUuid, onClose],
    );

    useImperativeHandle(
        ref,
        () => ({
            submit: (value: string) => {
                if (value === SAMPLE_VALUE) {
                    attachedSource?.detach();
                    onClose();
                } else if (value.startsWith(SUGGESTED_TABLE_PREFIX)) {
                    if (suggestedExplore) pickExplore(suggestedExplore.explore);
                    else onClose();
                } else if (value.startsWith(TABLE_PREFIX)) {
                    const name = value.slice(TABLE_PREFIX.length);
                    const explore = matchingExplores.find(
                        (candidate) => candidate.name === name,
                    );
                    if (explore) pickExplore(explore);
                    else onClose();
                } else if (value.startsWith(CHART_PREFIX)) {
                    const uuid = value.slice(CHART_PREFIX.length);
                    const chart = charts.find(
                        (candidate) => candidate.uuid === uuid,
                    );
                    if (chart) pickChart(chart);
                    else onClose();
                } else {
                    onClose();
                }
            },
        }),
        [
            attachedSource,
            suggestedExplore,
            matchingExplores,
            charts,
            pickExplore,
            pickChart,
            onClose,
        ],
    );

    const { attachFromLink, isResolvingLink } = useAttachResourceLink({
        projectUuid,
        onSelectChart: (chart) =>
            pickChart({ uuid: chart.uuid, name: chart.name }),
        onSelectDashboard: noop,
    });
    const handlePaste = useCallback(
        async (event: ClipboardEvent<HTMLInputElement>) => {
            if (!savedChartSource) return;
            const pasted = event.clipboardData.getData('text');
            if ((await attachFromLink(pasted, 'chart')) === 'attached') {
                setSearch('');
            }
        },
        [attachFromLink, savedChartSource],
    );

    const isInitialLoading =
        (exploreSource !== null && exploresQuery.isInitialLoading) ||
        (savedChartSource !== null && chartsQuery.isInitialLoading);

    // Opening lands on whatever is attached.
    useEffect(() => {
        if (isInitialLoading || hasScrolledToAttached.current) return;
        hasScrolledToAttached.current = true;
        viewportRef.current
            ?.querySelector('[data-combobox-active]')
            ?.scrollIntoView({ block: 'center' });
    }, [isInitialLoading]);

    const loadMoreIfNearBottom = useCallback(() => {
        const viewport = viewportRef.current;
        if (!viewport || !hasNextPage || isFetchingCharts) return;
        const remaining =
            viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
        if (remaining <= LOAD_MORE_THRESHOLD) void fetchNextPage();
    }, [hasNextPage, isFetchingCharts, fetchNextPage]);

    // A first page too short to scroll never fires a scroll event.
    useEffect(() => {
        loadMoreIfNearBottom();
    }, [chartPages, loadMoreIfNearBottom]);

    const hasSearch = needle !== '';
    const firstExplore = tableGroups[0]?.explores[0];
    const firstChart = chartGroups[0]?.[1][0];
    const firstOptionValue = suggestedExplore
        ? `${SUGGESTED_TABLE_PREFIX}${suggestedExplore.explore.name}`
        : firstExplore
          ? `${TABLE_PREFIX}${firstExplore.name}`
          : firstChart
            ? `${CHART_PREFIX}${firstChart.uuid}`
            : null;

    // Typing then Enter takes the first match.
    const { selectFirstOption, resetSelectedOption } = combobox;
    useEffect(() => {
        if (hasSearch && firstOptionValue !== null) selectFirstOption();
    }, [hasSearch, needle, firstOptionValue, selectFirstOption]);

    // What the list holds, as the copy names it.
    const kinds =
        exploreSource !== null && savedChartSource !== null
            ? 'tables or saved charts'
            : exploreSource !== null
              ? 'tables'
              : 'saved charts';
    const showTables = exploreSource !== null && tableGroups.length > 0;
    const showCharts = savedChartSource !== null && charts.length > 0;

    let list: ReactNode;
    if (isInitialLoading) {
        list = (
            <Group justify="center" p="sm">
                <Loader size="sm" />
            </Group>
        );
    } else if (!showTables && !showCharts && !exploresError && !chartsError) {
        list = (
            <Combobox.Empty fz="xs">
                {hasSearch
                    ? `No ${kinds} match “${search.trim()}”`
                    : `No ${kinds}`}
            </Combobox.Empty>
        );
    } else {
        list = (
            <>
                {exploresError && (
                    <InlineErrorState
                        message={exploresError.message}
                        onRetry={() => void exploresError.retry()}
                        p="sm"
                        mb={4}
                    />
                )}
                {suggestedExplore && (
                    <Combobox.Group
                        label={
                            <>
                                <MantineIcon
                                    icon={IconSparkles}
                                    size={12}
                                    color="indigo.4"
                                />
                                Suggested for this chart
                            </>
                        }
                        classNames={{ groupLabel: classes.sectionHeader }}
                        mb={4}
                    >
                        <Combobox.Option
                            value={`${SUGGESTED_TABLE_PREFIX}${suggestedExplore.explore.name}`}
                            className={classes.row}
                        >
                            <MantineIcon
                                icon={IconTable}
                                size={14}
                                color="dimmed"
                                className={classes.suggestionIcon}
                            />
                            <Stack gap={0} flex={1} miw={0}>
                                <Text fz="xs" fw={500} truncate>
                                    {suggestedExplore.explore.label}
                                </Text>
                                <Text
                                    c="dimmed"
                                    className={classes.suggestionReason}
                                    lineClamp={2}
                                    title={suggestedExplore.reason}
                                >
                                    {suggestedExplore.reason}
                                </Text>
                            </Stack>
                        </Combobox.Option>
                    </Combobox.Group>
                )}
                {showTables && (
                    <Combobox.Group
                        label="Tables"
                        classNames={{ groupLabel: classes.sectionHeader }}
                    >
                        {tableGroups.map((group) => {
                            const options = group.explores.map((explore) => (
                                <PickerOption
                                    key={explore.name}
                                    value={`${TABLE_PREFIX}${explore.name}`}
                                    isAttached={
                                        explore.name === attachedExploreName
                                    }
                                    icon={
                                        <MantineIcon
                                            icon={IconTable}
                                            size={14}
                                            color="dimmed"
                                        />
                                    }
                                    label={explore.label}
                                />
                            ));
                            return group.label === null ? (
                                <Box key="" mb={4}>
                                    {options}
                                </Box>
                            ) : (
                                <Combobox.Group
                                    key={group.label}
                                    label={group.label}
                                    classNames={{
                                        groupLabel: classes.groupLabel,
                                    }}
                                    mb={4}
                                >
                                    {options}
                                </Combobox.Group>
                            );
                        })}
                        {hiddenTableCount > 0 && (
                            <Text fz="xs" c="dimmed" px={6} pb={4}>
                                {`Type to search ${hiddenTableCount} more tables`}
                            </Text>
                        )}
                    </Combobox.Group>
                )}
                {chartsError && (
                    <InlineErrorState
                        message={chartsError.message}
                        onRetry={() => void chartsError.retry()}
                        p="sm"
                        mb={4}
                    />
                )}
                {showCharts && (
                    <Combobox.Group
                        label={
                            chartTotal !== null
                                ? `Saved charts · ${chartTotal}`
                                : 'Saved charts'
                        }
                        classNames={{ groupLabel: classes.sectionHeader }}
                    >
                        {chartGroups.map(([spaceName, groupCharts]) => (
                            <Combobox.Group
                                key={spaceName}
                                label={spaceName}
                                classNames={{ groupLabel: classes.groupLabel }}
                                mb={4}
                            >
                                {groupCharts.map((chart) => (
                                    <PickerOption
                                        key={chart.uuid}
                                        value={`${CHART_PREFIX}${chart.uuid}`}
                                        isAttached={
                                            chart.uuid === attachedChartUuid
                                        }
                                        icon={
                                            <ChartIcon
                                                chartKind={
                                                    chart.chartKind ??
                                                    ChartKind.VERTICAL_BAR
                                                }
                                            />
                                        }
                                        label={chart.name}
                                    />
                                ))}
                            </Combobox.Group>
                        ))}
                    </Combobox.Group>
                )}
            </>
        );
    }

    return (
        <>
            <Combobox.Search
                size="xs"
                placeholder={`Search ${kinds.replace(' or ', ' and ')}`}
                aria-label={`Search ${kinds.replace(' or ', ' and ')}`}
                leftSection={<MantineIcon icon={IconSearch} size={14} />}
                rightSection={
                    (isFetchingCharts && !chartsQuery.isInitialLoading) ||
                    isResolvingLink ? (
                        <Loader size={14} />
                    ) : undefined
                }
                value={search}
                onChange={(event) => {
                    setSearch(event.currentTarget.value);
                    resetSelectedOption();
                }}
                onPaste={(event) => void handlePaste(event)}
            />
            <Combobox.Options>
                <ScrollArea.Autosize
                    mah={350}
                    scrollbars="y"
                    classNames={{
                        content: `${scrollAreaClasses.verticalContent} ${classes.listContent}`,
                    }}
                    viewportRef={viewportRef}
                    onScrollPositionChange={loadMoreIfNearBottom}
                >
                    {list}
                </ScrollArea.Autosize>
                {attachedSource && (
                    <Combobox.Footer>
                        <PickerOption
                            value={SAMPLE_VALUE}
                            isAttached={false}
                            icon={
                                <MantineIcon
                                    icon={IconFlask}
                                    size={14}
                                    color="dimmed"
                                />
                            }
                            label="Use sample data instead"
                        />
                    </Combobox.Footer>
                )}
            </Combobox.Options>
        </>
    );
};

/**
 * The one picker for a builder's data source: tables and saved charts in one
 * searchable list. Picking either attaches it and closes; the sample row
 * detaches whatever is attached. A host offering one kind gets one section.
 */
const DataSourcePicker: FC<Props> = ({
    children,
    opened,
    onOpenedChange,
    savedChartSource,
    exploreSource,
    position,
    width,
}) => {
    const bodyRef = useRef<PickerBodyHandle>(null);
    const combobox = useCombobox({
        opened,
        onOpenedChange,
        loop: true,
        onDropdownClose: () => {
            combobox.resetSelectedOption();
            combobox.focusTarget();
        },
    });
    const { focusSearchInput, closeDropdown } = combobox;

    // Hosts open the picker through `opened`, which skips onDropdownOpen.
    useEffect(() => {
        if (opened) focusSearchInput();
    }, [opened, focusSearchInput]);

    const close = useCallback(() => closeDropdown(), [closeDropdown]);

    return (
        <Combobox
            store={combobox}
            position={position}
            width={width}
            offset={6}
            withinPortal
            keepMounted={false}
            onOptionSubmit={(value) => bodyRef.current?.submit(value)}
        >
            <Combobox.Target targetType="button">{children}</Combobox.Target>
            <Combobox.Dropdown className={classes.dropdown}>
                <PickerBody
                    ref={bodyRef}
                    combobox={combobox}
                    savedChartSource={savedChartSource}
                    exploreSource={exploreSource}
                    onClose={close}
                />
            </Combobox.Dropdown>
        </Combobox>
    );
};

export default DataSourcePicker;
