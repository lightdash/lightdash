import React, { FC, useEffect, useRef, useState } from 'react';
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
import { Popover2 } from '@blueprintjs/popover2';
import { DBChartTypes, SavedQuery } from 'common';
import EChartsReact from 'echarts-for-react';
import { FiltersForm } from '../filters/FiltersForm';
import { ResultsTable } from './ResultsTable';
import { SimpleChart } from './SimpleChart';
import { RenderedSql } from './RenderedSql';
import { RefreshServerButton } from './RefreshServerButton';
import { RefreshButton } from './RefreshButton';
import { ChartConfigPanel } from './ChartConfigPanel';
import { useQueryResults } from '../hooks/useQueryResults';
import { useChartConfig } from '../hooks/useChartConfig';
import { ChartDownloadMenu } from './ChartDownload';
import { useExplorer } from '../providers/ExplorerProvider';
import { CreateSavedQueryModal } from './SaveQueryModal';
import { useAddVersionMutation, useSavedQuery } from '../hooks/useSavedQuery';
import { Section, useTracking } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';

interface Props {
    savedQueryUuid?: string;
}

export const Explorer: FC<Props> = ({ savedQueryUuid }) => {
    const [isQueryModalOpen, setIsQueryModalOpen] = useState<boolean>(false);
    const chartRef = useRef<EChartsReact>(null);
    const {
        state: {
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
        actions: { setRowLimit: setResultsRowLimit },
    } = useExplorer();
    // queryResults are used here for prop-drill because the keepPreviousData: true option doesn't persist when
    // child components unmount: https://github.com/tannerlinsley/react-query/issues/2363
    const queryResults = useQueryResults();
    const chartConfig = useChartConfig(savedQueryUuid, queryResults);
    const { data } = useSavedQuery({ id: savedQueryUuid });
    const update = useAddVersionMutation();

    const [filterIsOpen, setFilterIsOpen] = useState<boolean>(false);
    const [resultsIsOpen, setResultsIsOpen] = useState<boolean>(true);
    const [sqlIsOpen, setSqlIsOpen] = useState<boolean>(false);
    const [vizIsOpen, setVizisOpen] = useState<boolean>(!!savedQueryUuid);
    const totalActiveFilters = filters
        .flatMap((filterGroup) => filterGroup.filters.length)
        .reduce((p, t) => p + t, 0);
    const [activeVizTab, setActiveVizTab] = useState<DBChartTypes>(
        DBChartTypes.COLUMN,
    );
    const queryData: Omit<SavedQuery, 'uuid' | 'name'> | undefined = tableName
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

    useEffect(() => {
        if (queryResults.isIdle && savedQueryUuid && tableName) {
            queryResults.refetch();
        }
    }, [savedQueryUuid, queryResults, tableName]);

    const isChartEmpty: boolean = !chartConfig.plotData;
    return (
        <>
            <Section name={SectionName.EXPLORER_TOP_BUTTONS}>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        justifyContent: 'flex-end',
                    }}
                >
                    <RefreshButton queryResults={queryResults} />
                    <RefreshServerButton />
                    <Popover2
                        content={
                            <Menu>
                                {savedQueryUuid && (
                                    <MenuItem
                                        icon="saved"
                                        text="Save chart"
                                        onClick={handleSavedQueryUpdate}
                                    />
                                )}
                                <MenuItem
                                    icon="add"
                                    text="Save chart as"
                                    onClick={() => setIsQueryModalOpen(true)}
                                />
                            </Menu>
                        }
                        placement="bottom"
                        disabled={!tableName}
                    >
                        <Button
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
            </Section>
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
                    {totalActiveFilters > 0 ? (
                        <Tag style={{ marginLeft: '10px' }}>
                            {totalActiveFilters} active filters
                        </Tag>
                    ) : null}
                </div>
                <Collapse isOpen={filterIsOpen}>
                    <FiltersForm />
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
                            icon={vizIsOpen ? 'chevron-down' : 'chevron-right'}
                            minimal
                            onClick={() => setVizisOpen((f) => !f)}
                        />
                        <H5 style={{ margin: 0, padding: 0 }}>Charts</H5>
                    </div>
                    {vizIsOpen && (
                        <ButtonGroup minimal>
                            <Button
                                active={activeVizTab === DBChartTypes.COLUMN}
                                icon="timeline-bar-chart"
                                onClick={() =>
                                    setActiveVizTab(DBChartTypes.COLUMN)
                                }
                                disabled={isChartEmpty}
                            >
                                Column
                            </Button>
                            <Button
                                active={activeVizTab === DBChartTypes.BAR}
                                icon="horizontal-bar-chart"
                                onClick={() =>
                                    setActiveVizTab(DBChartTypes.BAR)
                                }
                                disabled={isChartEmpty}
                            >
                                Bar
                            </Button>
                            <Button
                                active={activeVizTab === DBChartTypes.LINE}
                                icon="timeline-line-chart"
                                onClick={() =>
                                    setActiveVizTab(DBChartTypes.LINE)
                                }
                                disabled={isChartEmpty}
                            >
                                Line
                            </Button>
                            <Button
                                active={activeVizTab === DBChartTypes.SCATTER}
                                icon="scatter-plot"
                                onClick={() =>
                                    setActiveVizTab(DBChartTypes.SCATTER)
                                }
                                disabled={isChartEmpty}
                            >
                                Scatter
                            </Button>
                            <ChartConfigPanel
                                chartConfig={chartConfig}
                                disabled={isChartEmpty}
                            />
                            <ChartDownloadMenu
                                chartRef={chartRef}
                                disabled={isChartEmpty}
                            />
                        </ButtonGroup>
                    )}
                </div>
                <Collapse isOpen={vizIsOpen}>
                    <SimpleChart
                        chartRef={chartRef}
                        chartType={activeVizTab}
                        chartConfig={chartConfig}
                    />
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
                    <ResultsTable queryResults={queryResults} />
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
                    queryData={queryData}
                    onClose={() => setIsQueryModalOpen(false)}
                />
            )}
        </>
    );
};
