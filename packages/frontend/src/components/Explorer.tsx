import {
    Button,
    ButtonGroup,
    Card,
    Collapse,
    H5,
    Menu,
    MenuItem,
    Tag,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import {
    countTotalFilterRules,
    DashboardTileTypes,
    DBChartTypes,
    DimensionType,
    fieldId,
    getDefaultChartTileSize,
    getFields,
    isFilterableField,
    SavedQuery,
} from 'common';
import React, { FC, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { v4 as uuid4 } from 'uuid';
import { useExplore } from '../hooks/useExplore';
import { useQueryResults } from '../hooks/useQueryResults';
import {
    CreateSavedQueryVersion,
    useAddVersionMutation,
    useSavedQuery,
    useUpdateMutation,
} from '../hooks/useSavedQuery';
import { useExplorer } from '../providers/ExplorerProvider';
import { TrackSection } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';
import AddColumnButton from './AddColumnButton';
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
        actions: { setRowLimit, setFilters },
    } = useExplorer();
    const explore = useExplore(tableName);
    const queryResults = useQueryResults();
    const { data } = useSavedQuery({ id: savedQueryUuid });
    const [seriesLayout, setSeriesLayout] = useState<
        SavedQuery['chartConfig']['seriesLayout'] | undefined
    >();

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
                  seriesLayout: seriesLayout || {},
              },
              tableConfig: {
                  columnOrder,
              },
          }
        : undefined;

    const [fieldsWithSuggestions, setFieldsWithSuggestions] =
        useState<FieldsWithSuggestions>({});
    useEffect(() => {
        if (explore.data) {
            setFieldsWithSuggestions((prev) => {
                return getFields(explore.data).reduce((sum, field) => {
                    if (isFilterableField(field)) {
                        let suggestions: string[] = [];
                        if (field.type === DimensionType.STRING) {
                            const currentSuggestions =
                                prev[fieldId(field)]?.suggestions || [];
                            const newSuggestions: string[] =
                                queryResults.data?.rows.reduce<string[]>(
                                    (acc, row) => {
                                        const value = row[fieldId(field)];
                                        if (typeof value === 'string') {
                                            return [...acc, value];
                                        }
                                        return acc;
                                    },
                                    [],
                                ) || [];
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
                data: queryData,
            });
        }
    };

    useEffect(() => {
        if (data?.chartConfig.chartType) {
            setActiveVizTab(data.chartConfig.chartType);
        }
    }, [data]);

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
                    seriesLayout={data?.chartConfig.seriesLayout}
                    chartType={activeVizTab}
                    tableName={tableName}
                    resultsData={queryResults.data}
                    isLoading={queryResults.isLoading}
                    onSeriesLayoutChange={setSeriesLayout}
                    onChartTypeChange={setActiveVizTab}
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
                                <ChartConfigPanel />
                                <ChartDownloadMenu />
                                <ButtonGroup>
                                    <Button
                                        text="Save chart"
                                        disabled={!tableName}
                                        onClick={
                                            savedQueryUuid
                                                ? handleSavedQueryUpdate
                                                : () =>
                                                      setIsQueryModalOpen(true)
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
                                rows={queryResults.data?.rows}
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
                            ...getDefaultChartTileSize(activeVizTab),
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
