import {
    Button,
    ButtonGroup,
    Card,
    Classes,
    Collapse,
    Dialog,
    Divider,
    H5,
    Menu,
    MenuItem,
    Tag,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import {
    ChartConfig,
    ChartType,
    countTotalFilterRules,
    CreateSavedChartVersion,
    DashboardBasicDetails,
    DimensionType,
    fieldId,
    getResultValues,
    getVisibleFields,
    isFilterableField,
    SavedChart,
} from 'common';
import { FC, useEffect, useState } from 'react';
import { Link, useHistory, useLocation, useParams } from 'react-router-dom';
import { getDashboards } from '../hooks/dashboard/useDashboards';
import { useExplore } from '../hooks/useExplore';
import { useQueryResults } from '../hooks/useQueryResults';
import {
    useAddVersionMutation,
    useDeleteMutation,
    useDuplicateMutation,
    useSavedQuery,
    useUpdateMutation,
} from '../hooks/useSavedQuery';
import { useExplorer } from '../providers/ExplorerProvider';
import { TrackSection } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';
import AddColumnButton from './AddColumnButton';
import BigNumberConfigPanel from './BigNumberConfig';
import ChartConfigPanel from './ChartConfigPanel';
import { ChartDownloadMenu } from './ChartDownload';
import { BigButton } from './common/BigButton';
import EditableHeader from './common/EditableHeader';
import FiltersForm from './common/Filters';
import {
    FieldsWithSuggestions,
    FiltersProvider,
} from './common/Filters/FiltersProvider';
import DownloadCsvButton from './DownloadCsvButton';
import { ExplorerResults } from './Explorer/ExplorerResults';
import VisualizationCardOptions from './Explorer/VisualizationCardOptions';
import LightdashVisualization from './LightdashVisualization';
import VisualizationProvider from './LightdashVisualization/VisualizationProvider';
import LimitButton from './LimitButton';
import { RefreshButton } from './RefreshButton';
import { RefreshServerButton } from './RefreshServerButton';
import { RenderedSql } from './RenderedSql';
import AddTilesToDashboardModal from './SavedDashboards/AddTilesToDashboardModal';
import CreateSavedQueryModal from './SavedQueries/CreateSavedQueryModal';

interface Props {
    savedQueryUuid?: string;
}

export const Explorer: FC<Props> = ({ savedQueryUuid }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const updateSavedChart = useUpdateMutation(savedQueryUuid);
    const { mutate: deleteData, isLoading: isDeleting } = useDeleteMutation();
    const [isQueryModalOpen, setIsQueryModalOpen] = useState<boolean>(false);
    const [isAddToDashboardModalOpen, setIsAddToDashboardModalOpen] =
        useState<boolean>(false);
    const location = useLocation<
        { fromExplorer?: boolean; explore?: boolean } | undefined
    >();
    const {
        state: {
            chartName,
            tableName,
            dimensions,
            metrics,
            sorts,
            limit,
            filters,
            columnOrder,
            tableCalculations,
            selectedTableCalculations,
        },
        actions: { setRowLimit, setFilters },
    } = useExplorer();
    const explore = useExplore(tableName);
    const queryResults = useQueryResults();
    const { data, isLoading } = useSavedQuery({ id: savedQueryUuid });
    const [validChartConfig, setValidChartConfig] =
        useState<ChartConfig['config']>();

    const update = useAddVersionMutation();
    const history = useHistory();
    const [filterIsOpen, setFilterIsOpen] = useState<boolean>(false);
    const [resultsIsOpen, setResultsIsOpen] = useState<boolean>(true);
    const [sqlIsOpen, setSqlIsOpen] = useState<boolean>(false);
    const [vizIsOpen, setVizisOpen] = useState<boolean>(!!savedQueryUuid);
    const totalActiveFilters: number = countTotalFilterRules(filters);
    const chartId = savedQueryUuid || '';
    const { mutate: duplicateChart } = useDuplicateMutation(chartId);
    const [activeVizTab, setActiveVizTab] = useState<ChartType>(
        ChartType.CARTESIAN,
    );

    const searchParams = new URLSearchParams(location.search);

    const overrideQueryUuid: string | undefined = searchParams.get('explore')
        ? undefined
        : savedQueryUuid;

    const [pivotDimensions, setPivotDimensions] = useState<string[]>();

    const validConfig = () => {
        switch (activeVizTab) {
            case ChartType.TABLE:
                return undefined;
            case ChartType.BIG_NUMBER:
                return validChartConfig;
            default:
                return validChartConfig || { series: [] };
        }
    };
    const queryData: CreateSavedChartVersion | undefined = tableName
        ? ({
              tableName,
              metricQuery: {
                  // order of fields is important for the hasUnsavedChanges method
                  dimensions,
                  metrics,
                  filters,
                  sorts,
                  limit,
                  tableCalculations: tableCalculations.filter((t) =>
                      selectedTableCalculations.includes(t.name),
                  ),
                  additionalMetrics: [],
              },
              pivotConfig: pivotDimensions
                  ? { columns: pivotDimensions }
                  : undefined,
              chartConfig: {
                  type: activeVizTab,
                  config: validConfig(),
              },
              tableConfig: {
                  columnOrder,
              },
          } as CreateSavedChartVersion)
        : undefined;
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] =
        useState<boolean>(false);
    const [relatedDashboards, setRelatedDashboards] = useState<
        DashboardBasicDetails[]
    >([]);

    const [fieldsWithSuggestions, setFieldsWithSuggestions] =
        useState<FieldsWithSuggestions>({});
    useEffect(() => {
        if (explore.data) {
            setFieldsWithSuggestions((prev) => {
                return getVisibleFields(explore.data).reduce((sum, field) => {
                    if (isFilterableField(field)) {
                        let suggestions: string[] = [];
                        if (field.type === DimensionType.STRING) {
                            const currentSuggestions =
                                prev[fieldId(field)]?.suggestions || [];
                            const newSuggestions: string[] =
                                (queryResults.data &&
                                    getResultValues(
                                        queryResults.data.rows,
                                        true,
                                    ).reduce<string[]>((acc, row) => {
                                        const value = row[fieldId(field)];
                                        if (typeof value === 'string') {
                                            return [...acc, value];
                                        }
                                        return acc;
                                    }, [])) ||
                                [];
                            suggestions = Array.from(
                                new Set([
                                    ...currentSuggestions,
                                    ...newSuggestions,
                                ]),
                            ).sort((a, b) => a.localeCompare(b));
                        }
                        return {
                            ...sum,
                            [fieldId(field)]: {
                                ...field,
                                suggestions,
                            },
                        };
                    }
                    return sum;
                }, {});
            });
        }
    }, [explore.data, queryResults.data]);

    const handleSavedQueryUpdate = () => {
        if (savedQueryUuid && queryData) {
            update.mutate({
                uuid: savedQueryUuid,
                payload: queryData,
            });
        }
    };

    useEffect(() => {
        if (data) {
            setActiveVizTab(data.chartConfig.type);
        }
    }, [data]);

    const hasUnsavedChanges = (): boolean => {
        const filterData = (
            d: SavedChart | CreateSavedChartVersion | undefined,
        ) => {
            return {
                chartConfig: d?.chartConfig,
                metricQuery: d?.metricQuery,
                tableConfig: d?.tableConfig,
            };
        };

        return (
            JSON.stringify(filterData(data)) !==
            JSON.stringify(filterData(queryData))
        );
    };
    return (
        <>
            <TrackSection name={SectionName.EXPLORER_TOP_BUTTONS}>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                    }}
                >
                    <div
                        style={{
                            flex: 1,
                            justifyContent: 'flex-start',
                            display: 'flex',
                            alignItems: 'center',
                            overflow: 'hidden',
                            marginRight: 10,
                        }}
                    >
                        {overrideQueryUuid && chartName && (
                            <EditableHeader
                                value={chartName}
                                isDisabled={updateSavedChart.isLoading}
                                onChange={(newName) =>
                                    updateSavedChart.mutate({ name: newName })
                                }
                            />
                        )}
                    </div>
                    <RefreshButton />
                    <RefreshServerButton />
                    <Popover2
                        content={
                            <Menu>
                                <MenuItem
                                    icon="cog"
                                    text="Project settings"
                                    href={`/projects/${projectUuid}/settings`}
                                />
                            </Menu>
                        }
                        placement="bottom"
                        disabled={!tableName}
                    >
                        <BigButton
                            icon="more"
                            disabled={!tableName}
                            style={{
                                height: 40,
                                width: 40,
                                marginLeft: '10px',
                            }}
                        />
                    </Popover2>
                </div>
            </TrackSection>
            <div style={{ paddingTop: '10px' }} />
            <Card style={{ padding: 5 }} elevation={1}>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                    }}
                >
                    <Button
                        icon={filterIsOpen ? 'chevron-down' : 'chevron-right'}
                        minimal
                        onClick={() => setFilterIsOpen((f) => !f)}
                    />
                    <H5 style={{ margin: 0, padding: 0 }}>Filters</H5>
                    {totalActiveFilters > 0 && !filterIsOpen ? (
                        <Tag style={{ marginLeft: '10px' }}>
                            {totalActiveFilters} active filters
                        </Tag>
                    ) : null}
                </div>
                <Collapse isOpen={filterIsOpen}>
                    <FiltersProvider fieldsMap={fieldsWithSuggestions}>
                        <FiltersForm
                            filters={filters}
                            setFilters={setFilters}
                        />
                    </FiltersProvider>
                </Collapse>
            </Card>
            <div style={{ paddingTop: '10px' }} />

            <Card style={{ padding: 5, overflowY: 'scroll' }} elevation={1}>
                <VisualizationProvider
                    chartConfigs={data?.chartConfig}
                    chartType={activeVizTab}
                    pivotDimensions={data?.pivotConfig?.columns}
                    tableName={tableName}
                    resultsData={queryResults.data}
                    isLoading={queryResults.isLoading || isLoading}
                    onChartConfigChange={setValidChartConfig}
                    onBigNumberLabelChange={setValidChartConfig}
                    onChartTypeChange={setActiveVizTab}
                    onPivotDimensionsChange={setPivotDimensions}
                >
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'row',
                                alignItems: 'center',
                            }}
                        >
                            <Button
                                icon={
                                    vizIsOpen ? 'chevron-down' : 'chevron-right'
                                }
                                minimal
                                onClick={() => setVizisOpen((f) => !f)}
                            />
                            <H5 style={{ margin: 0, padding: 0 }}>Charts</H5>
                        </div>
                        {vizIsOpen && (
                            <div
                                style={{
                                    display: 'inline-flex',
                                    flexWrap: 'wrap',
                                    gap: '10px',
                                    marginRight: '10px',
                                }}
                            >
                                <VisualizationCardOptions />
                                {activeVizTab === ChartType.BIG_NUMBER ? (
                                    <BigNumberConfigPanel />
                                ) : (
                                    <ChartConfigPanel />
                                )}
                                <ChartDownloadMenu />
                                <ButtonGroup>
                                    <Button
                                        text={
                                            overrideQueryUuid
                                                ? 'Save changes'
                                                : 'Save chart'
                                        }
                                        disabled={
                                            !tableName || !hasUnsavedChanges()
                                        }
                                        onClick={
                                            overrideQueryUuid
                                                ? handleSavedQueryUpdate
                                                : () =>
                                                      setIsQueryModalOpen(true)
                                        }
                                    />
                                    {overrideQueryUuid && (
                                        <Popover2
                                            placement="bottom"
                                            disabled={!tableName}
                                            content={
                                                <Menu>
                                                    <MenuItem
                                                        icon={
                                                            hasUnsavedChanges()
                                                                ? 'add'
                                                                : 'duplicate'
                                                        }
                                                        text={
                                                            hasUnsavedChanges()
                                                                ? 'Save chart as'
                                                                : 'Duplicate'
                                                        }
                                                        onClick={() => {
                                                            if (
                                                                savedQueryUuid &&
                                                                hasUnsavedChanges()
                                                            ) {
                                                                setIsQueryModalOpen(
                                                                    true,
                                                                );
                                                            } else {
                                                                duplicateChart(
                                                                    chartId,
                                                                );
                                                            }
                                                        }}
                                                    />
                                                    <MenuItem
                                                        icon="control"
                                                        text="Add to dashboard"
                                                        onClick={() =>
                                                            setIsAddToDashboardModalOpen(
                                                                true,
                                                            )
                                                        }
                                                    />
                                                    <Divider />
                                                    <MenuItem
                                                        icon="trash"
                                                        text="Delete"
                                                        intent="danger"
                                                        onClick={() => {
                                                            getDashboards(
                                                                projectUuid,
                                                                savedQueryUuid,
                                                            ).then(
                                                                (
                                                                    dashboards,
                                                                ) => {
                                                                    setRelatedDashboards(
                                                                        dashboards,
                                                                    );

                                                                    setIsDeleteDialogOpen(
                                                                        true,
                                                                    );
                                                                },
                                                            );
                                                        }}
                                                    />
                                                </Menu>
                                            }
                                        >
                                            <Button
                                                icon="more"
                                                disabled={!tableName}
                                            />
                                        </Popover2>
                                    )}
                                </ButtonGroup>
                            </div>
                        )}
                    </div>

                    <Collapse className="explorer-chart" isOpen={vizIsOpen}>
                        <div
                            style={{ height: '300px' }}
                            className="cohere-block"
                        >
                            <LightdashVisualization />
                        </div>
                    </Collapse>
                </VisualizationProvider>
            </Card>
            <div style={{ paddingTop: '10px' }} />

            <Card style={{ padding: 5 }} elevation={1}>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                        }}
                    >
                        <Button
                            icon={
                                resultsIsOpen ? 'chevron-down' : 'chevron-right'
                            }
                            minimal
                            onClick={() => setResultsIsOpen((f) => !f)}
                        />
                        <H5 style={{ margin: 0, padding: 0, marginRight: 10 }}>
                            Results
                        </H5>
                        {resultsIsOpen && (
                            <LimitButton
                                limit={limit}
                                onLimitChange={setRowLimit}
                            />
                        )}
                    </div>
                    {resultsIsOpen && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                marginRight: 10,
                                gap: 10,
                            }}
                        >
                            <AddColumnButton />
                            <DownloadCsvButton
                                fileName={tableName}
                                rows={
                                    queryResults.data &&
                                    getResultValues(queryResults.data.rows)
                                }
                            />
                        </div>
                    )}
                </div>
                <Collapse isOpen={resultsIsOpen}>
                    <ExplorerResults />
                </Collapse>
            </Card>
            <div style={{ paddingTop: '10px' }} />
            <Card
                style={{ padding: 5, height: sqlIsOpen ? '100%' : 'auto' }}
                elevation={1}
            >
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                    }}
                >
                    <Button
                        icon={sqlIsOpen ? 'chevron-down' : 'chevron-right'}
                        minimal
                        onClick={() => setSqlIsOpen((f) => !f)}
                    />
                    <H5 style={{ margin: 0, padding: 0 }}>SQL</H5>
                </div>
                <Collapse isOpen={sqlIsOpen}>
                    <RenderedSql />
                </Collapse>
            </Card>
            {queryData && (
                <CreateSavedQueryModal
                    isOpen={isQueryModalOpen}
                    savedData={queryData}
                    onClose={() => setIsQueryModalOpen(false)}
                />
            )}

            {data && (
                <AddTilesToDashboardModal
                    isOpen={isAddToDashboardModalOpen}
                    savedChart={data}
                    onClose={() => setIsAddToDashboardModalOpen(false)}
                />
            )}
            <Dialog
                isOpen={isDeleteDialogOpen}
                icon="delete"
                onClose={() =>
                    !isDeleting ? setIsDeleteDialogOpen(false) : undefined
                }
                title={'Delete chart'}
            >
                <div className={Classes.DIALOG_BODY}>
                    <p>
                        Are you sure you want to delete the chart{' '}
                        <b>"{chartName}"</b> ?
                    </p>

                    {relatedDashboards && relatedDashboards.length > 0 && (
                        <>
                            <b>
                                This action will remove a chart tile from{' '}
                                {relatedDashboards.length} dashboard
                                {relatedDashboards.length > 1 ? 's' : ''}:
                            </b>
                            <ul>
                                {relatedDashboards.map((dashboard) => {
                                    return (
                                        <li>
                                            <Link
                                                target="_blank"
                                                to={`/projects/${projectUuid}/dashboards/${dashboard.uuid}`}
                                            >
                                                {dashboard.name}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button
                            disabled={isDeleting}
                            onClick={() => setIsDeleteDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={isDeleting}
                            intent="danger"
                            onClick={() => {
                                /*
                                Check the location of `goBack` after deleting a chart
                                if we land on an unsaved chart, 
                                we go back further into an empty explore
                                */
                                history.listen((loc, action) => {
                                    if (action === 'POP') {
                                        if (loc.pathname.includes('/tables/')) {
                                            history.push(
                                                `/projects/${projectUuid}/tables`,
                                            );
                                        }
                                    }
                                });

                                if (savedQueryUuid) {
                                    deleteData(savedQueryUuid);
                                    history.goBack();
                                }

                                setIsDeleteDialogOpen(false);
                            }}
                        >
                            Delete
                        </Button>
                    </div>
                </div>
            </Dialog>
        </>
    );
};
