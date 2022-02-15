import {
    Button,
    ButtonGroup,
    Card,
    Collapse,
    FormGroup,
    H5,
    Menu,
    MenuItem,
    NumericInput,
    Tag,
} from '@blueprintjs/core';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import {
    countTotalFilterRules,
    CreateSavedQueryVersion,
    DashboardTileTypes,
    DBChartTypes,
    filterableDimensionsOnly,
    getDefaultChartTileSize,
    getDimensions,
    getMetrics,
} from 'common';
import EChartsReact from 'echarts-for-react';
import React, { FC, useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { v4 as uuid4 } from 'uuid';
import { useChartConfig } from '../hooks/useChartConfig';
import { useExplore } from '../hooks/useExplore';
import { useQueryResults } from '../hooks/useQueryResults';
import {
    useAddVersionMutation,
    useSavedQuery,
    useUpdateMutation,
} from '../hooks/useSavedQuery';
import { useExplorer } from '../providers/ExplorerProvider';
import { TrackSection } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';
import bigNumberConfig from '../utils/bigNumberConfig';
import { ChartConfigPanel } from './ChartConfigPanel';
import { ChartDownloadMenu } from './ChartDownload';
import { BigButton } from './common/BigButton';
import EditableHeader from './common/EditableHeader';
import FiltersForm from './common/Filters';
import { ExplorerResults } from './Explorer/ExplorerResults';
import LightdashVisualization from './LightdashVisualization';
import { RefreshButton } from './RefreshButton';
import { RefreshServerButton } from './RefreshServerButton';
import { RenderedSql } from './RenderedSql';
import AddTilesToDashboardModal from './SavedDashboards/AddTilesToDashboardModal';
import CreateSavedDashboardModal from './SavedDashboards/CreateSavedDashboardModal';
import DashboardForm from './SavedDashboards/DashboardForm';
import CreateSavedQueryModal from './SavedQueries/CreateSavedQueryModal';
import SavedQueryForm from './SavedQueries/SavedQueryForm';

interface Props {
    savedQueryUuid?: string;
}

export const Explorer: FC<Props> = ({ savedQueryUuid }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const updateSavedChart = useUpdateMutation(savedQueryUuid);
    const [isQueryModalOpen, setIsQueryModalOpen] = useState<boolean>(false);
    const [isAddToDashboardModalOpen, setIsAddToDashboardModalOpen] =
        useState<boolean>(false);
    const [isAddToNewDashboardModalOpen, setIsAddToNewDashboardModalOpen] =
        useState<boolean>(false);
    const chartRef = useRef<EChartsReact>(null);
    const location = useLocation<{ fromExplorer?: boolean } | undefined>();
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
        actions: { setRowLimit: setResultsRowLimit, setFilters },
    } = useExplorer();
    const explore = useExplore(tableName);
    const queryResults = useQueryResults();
    const { data } = useSavedQuery({ id: savedQueryUuid });
    const chartConfig = useChartConfig(
        tableName,
        queryResults.data,
        data?.chartConfig.seriesLayout,
    );

    const update = useAddVersionMutation();

    const [filterIsOpen, setFilterIsOpen] = useState<boolean>(false);
    const [resultsIsOpen, setResultsIsOpen] = useState<boolean>(true);
    const [sqlIsOpen, setSqlIsOpen] = useState<boolean>(false);
    const [vizIsOpen, setVizisOpen] = useState<boolean>(
        !!savedQueryUuid && !location.state?.fromExplorer,
    );
    const totalActiveFilters: number = countTotalFilterRules(filters);
    const [activeVizTab, setActiveVizTab] = useState<DBChartTypes>(
        DBChartTypes.COLUMN,
    );
    const bigNumber = bigNumberConfig(queryResults.data);
    const queryData: CreateSavedQueryVersion | undefined = tableName
        ? {
              tableName,
              metricQuery: {
                  dimensions,
                  metrics,
                  sorts,
                  filters,
                  limit,
                  tableCalculations: tableCalculations.filter((t) =>
                      selectedTableCalculations.includes(t.name),
                  ),
              },
              chartConfig: {
                  chartType: activeVizTab,
                  seriesLayout: chartConfig.seriesLayout,
              },
              tableConfig: {
                  columnOrder,
              },
          }
        : undefined;

    const filterableDimensions = explore.data
        ? filterableDimensionsOnly(getDimensions(explore.data))
        : [];

    const filterableMetrics = explore.data ? getMetrics(explore.data) : [];

    const handleSavedQueryUpdate = () => {
        if (savedQueryUuid && queryData) {
            update.mutate({
                uuid: savedQueryUuid,
                data: queryData,
            });
        }
    };

    useEffect(() => {
        if (data?.chartConfig.chartType) {
            setActiveVizTab(data.chartConfig.chartType);
        }
    }, [data]);
    const isBigNumber = activeVizTab === DBChartTypes.BIG_NUMBER;
    const isChartEmpty: boolean = !chartConfig.plotData;
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
                        {chartName && (
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
                    <FiltersForm
                        dimensions={filterableDimensions}
                        metrics={filterableMetrics}
                        filters={filters}
                        setFilters={setFilters}
                    />
                </Collapse>
            </Card>
            <div style={{ paddingTop: '10px' }} />

            <Card style={{ padding: 5, overflowY: 'scroll' }} elevation={1}>
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
                            icon={vizIsOpen ? 'chevron-down' : 'chevron-right'}
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
                            <Tooltip2
                                content="Column"
                                placement="top"
                                interactionKind="hover"
                            >
                                <Button
                                    minimal
                                    active={
                                        activeVizTab === DBChartTypes.COLUMN
                                    }
                                    icon="timeline-bar-chart"
                                    onClick={() =>
                                        setActiveVizTab(DBChartTypes.COLUMN)
                                    }
                                    disabled={isChartEmpty}
                                    name="Column"
                                />
                            </Tooltip2>
                            <Tooltip2
                                content="Bar"
                                placement="top"
                                interactionKind="hover"
                            >
                                <Button
                                    minimal
                                    active={activeVizTab === DBChartTypes.BAR}
                                    icon="horizontal-bar-chart"
                                    onClick={() =>
                                        setActiveVizTab(DBChartTypes.BAR)
                                    }
                                    disabled={isChartEmpty}
                                    name="Bar"
                                />
                            </Tooltip2>
                            <Tooltip2
                                content="Line"
                                placement="top"
                                interactionKind="hover"
                            >
                                <Button
                                    minimal
                                    active={activeVizTab === DBChartTypes.LINE}
                                    icon="timeline-line-chart"
                                    onClick={() =>
                                        setActiveVizTab(DBChartTypes.LINE)
                                    }
                                    disabled={isChartEmpty}
                                    name="Line"
                                />
                            </Tooltip2>
                            <Tooltip2
                                content="Scatter"
                                placement="top"
                                interactionKind="hover"
                            >
                                <Button
                                    minimal
                                    active={
                                        activeVizTab === DBChartTypes.SCATTER
                                    }
                                    icon="scatter-plot"
                                    onClick={() =>
                                        setActiveVizTab(DBChartTypes.SCATTER)
                                    }
                                    disabled={isChartEmpty}
                                    name="Scatter"
                                />
                            </Tooltip2>
                            <Tooltip2
                                content="Table"
                                placement="top"
                                interactionKind="hover"
                            >
                                <Button
                                    minimal
                                    active={activeVizTab === DBChartTypes.TABLE}
                                    icon="panel-table"
                                    onClick={() =>
                                        setActiveVizTab(DBChartTypes.TABLE)
                                    }
                                    disabled={isChartEmpty}
                                    name="Table"
                                />
                            </Tooltip2>
                            <Tooltip2
                                content="Big number"
                                placement="top"
                                interactionKind="hover"
                            >
                                <Button
                                    minimal
                                    active={isBigNumber}
                                    icon="numerical"
                                    onClick={() =>
                                        setActiveVizTab(DBChartTypes.BIG_NUMBER)
                                    }
                                    disabled={!bigNumber}
                                    name="Big Number"
                                />
                            </Tooltip2>
                            <ChartConfigPanel
                                chartConfig={chartConfig}
                                disabled={isChartEmpty || isBigNumber}
                            />
                            {chartConfig.plotData && !isBigNumber && (
                                <ChartDownloadMenu
                                    chartRef={chartRef}
                                    disabled={isChartEmpty}
                                    chartType={activeVizTab}
                                    chartData={chartConfig.plotData}
                                />
                            )}
                            <ButtonGroup>
                                <Button
                                    text="Save chart"
                                    disabled={!tableName}
                                    onClick={
                                        savedQueryUuid
                                            ? handleSavedQueryUpdate
                                            : () => setIsQueryModalOpen(true)
                                    }
                                />
                                {savedQueryUuid && (
                                    <Popover2
                                        placement="bottom"
                                        disabled={!tableName}
                                        content={
                                            <Menu>
                                                <MenuItem
                                                    icon="add"
                                                    text="Save chart as"
                                                    onClick={() =>
                                                        setIsQueryModalOpen(
                                                            true,
                                                        )
                                                    }
                                                />
                                                <MenuItem
                                                    icon="circle-arrow-right"
                                                    text="Add chart to an existing dashboard"
                                                    onClick={() =>
                                                        setIsAddToDashboardModalOpen(
                                                            true,
                                                        )
                                                    }
                                                />
                                                <MenuItem
                                                    icon="control"
                                                    text="Create dashboard with chart"
                                                    onClick={() =>
                                                        setIsAddToNewDashboardModalOpen(
                                                            true,
                                                        )
                                                    }
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
                    <div style={{ height: '300px' }} className="cohere-block">
                        <LightdashVisualization
                            chartConfig={chartConfig}
                            chartRef={chartRef}
                            chartType={activeVizTab}
                            tableName={tableName}
                            resultsData={queryResults.data}
                            isLoading={queryResults.isLoading}
                        />
                    </div>
                </Collapse>
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
                        <H5 style={{ margin: 0, padding: 0 }}>Results</H5>
                    </div>
                    {resultsIsOpen && (
                        <FormGroup
                            style={{ marginRight: 12 }}
                            label="Total rows:"
                            inline
                        >
                            <NumericInput
                                style={{ width: 100 }}
                                min={0}
                                buttonPosition="none"
                                value={limit}
                                onValueChange={(valueAsNumber) =>
                                    setResultsRowLimit(valueAsNumber)
                                }
                            />
                        </FormGroup>
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
                    ModalContent={SavedQueryForm}
                />
            )}
            {data && (
                <CreateSavedDashboardModal
                    isOpen={isAddToNewDashboardModalOpen}
                    tiles={[
                        {
                            uuid: uuid4(),
                            type: DashboardTileTypes.SAVED_CHART,
                            properties: {
                                savedChartUuid: data.uuid,
                            },
                            ...getDefaultChartTileSize(
                                data.chartConfig.chartType,
                            ),
                        },
                    ]}
                    showRedirectButton
                    onClose={() => setIsAddToNewDashboardModalOpen(false)}
                    ModalContent={DashboardForm}
                />
            )}
            {data && isAddToDashboardModalOpen && (
                <AddTilesToDashboardModal
                    savedChart={data}
                    onClose={() => setIsAddToDashboardModalOpen(false)}
                />
            )}
        </>
    );
};
