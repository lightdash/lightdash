import { Button, Card, Collapse, H5, useHotkeys } from '@blueprintjs/core';
import { TreeNodeInfo } from '@blueprintjs/core/src/components/tree/treeNode';
import {
    ApiQueryResults,
    ChartConfig,
    ChartType,
    CompiledDimension,
    DimensionType,
    Explore,
    fieldId,
    FieldId,
    FieldType,
    friendlyName,
    SupportedDbtAdapter,
    TableBase,
} from '@lightdash/common';
import moment from 'moment';
import React, { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import BigNumberConfigPanel from '../components/BigNumberConfig';
import ChartConfigPanel from '../components/ChartConfigPanel';
import { ChartDownloadMenu } from '../components/ChartDownload';
import { CollapsableCard } from '../components/common/CollapsableCard';
import PageWithSidebar from '../components/common/Page/PageWithSidebar';
import Sidebar from '../components/common/Page/Sidebar';
import SideBarLoadingState from '../components/common/SideBarLoadingState';
import { Tree } from '../components/common/Tree';
import RefreshDbtButton from '../components/RefreshDbtButton';
import VisualizationCardOptions from '../components/Explorer/VisualizationCardOptions';
import LightdashVisualization from '../components/LightdashVisualization';
import VisualizationProvider from '../components/LightdashVisualization/VisualizationProvider';
import RunSqlQueryButton from '../components/SqlRunner/RunSqlQueryButton';
import SqlRunnerInput from '../components/SqlRunner/SqlRunnerInput';
import SqlRunnerResultsTable from '../components/SqlRunner/SqlRunnerResultsTable';
import { useProjectCatalog } from '../hooks/useProjectCatalog';
import { useProjectCatalogTree } from '../hooks/useProjectCatalogTree';
import { useSqlQueryMutation } from '../hooks/useSqlQuery';
import { TrackSection } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';
import {
    ButtonsWrapper,
    ContentContainer,
    MissingTablesInfo,
    SideBarWrapper,
    SqlCallout,
    Title,
} from './SqlRunner.styles';

const CardDivider = styled('div')`
    padding-top: 10px;
`;

const generateBasicSqlQuery = (table: string) =>
    `SELECT *
     FROM ${table} LIMIT 25`;

const SqlRunnerPage = () => {
    const [sql, setSql] = useState<string>('');
    const { isLoading: isCatalogLoading, data: catalogData } =
        useProjectCatalog();
    const sqlQueryMutation = useSqlQueryMutation();
    const { isLoading, mutate, data } = sqlQueryMutation;

    const sqlQueryDimensions: Record<FieldId, CompiledDimension> = useMemo(
        () =>
            Object.entries((data?.rows || [])[0] || {}).reduce(
                (acc, [key, value]) => {
                    let type = DimensionType.STRING;
                    if (typeof value === 'number' || !isNaN(value)) {
                        type = DimensionType.NUMBER;
                    } else if (typeof value === 'boolean') {
                        type = DimensionType.BOOLEAN;
                    } else if (
                        typeof value === 'string' &&
                        moment(value).isValid()
                    ) {
                        type = DimensionType.TIMESTAMP;
                    }

                    const dimension: CompiledDimension = {
                        fieldType: FieldType.DIMENSION,
                        type,
                        name: key,
                        label: friendlyName(key),
                        table: 'sql_runner',
                        tableLabel: 'sql_runner',
                        sql: '',
                        compiledSql: '',
                        hidden: false,
                    };
                    return { ...acc, [fieldId(dimension)]: dimension };
                },
                {},
            ),
        [data],
    );

    const resultsData: ApiQueryResults = useMemo(
        () => ({
            metricQuery: {
                dimensions: Object.keys(sqlQueryDimensions),
                metrics: [],
                filters: {},
                sorts: [],
                limit: 0,
                tableCalculations: [],
            },
            rows: (data?.rows || []).map((row) =>
                Object.keys(row).reduce((acc, columnName) => {
                    const raw = row[columnName];
                    return {
                        ...acc,
                        [`sql_runner_${columnName}`]: {
                            value: {
                                raw,
                                formatted: raw,
                            },
                        },
                    };
                }, {}),
            ),
        }),
        [data?.rows, sqlQueryDimensions],
    );
    const explore: Explore = useMemo(
        () => ({
            name: 'sql_runner',
            label: 'SQL runner',
            tags: [],
            baseTable: 'sql_runner',
            joinedTables: [],
            tables: {
                sql_runner: {
                    name: 'sql_runner',
                    label: 'sql_runner',
                    database: 'sql_runner',
                    schema: 'sql_runner',
                    sqlTable: 'sql_runner',
                    dimensions: sqlQueryDimensions,
                    metrics: {},
                    lineageGraph: {},
                },
            },
            targetDatabase: SupportedDbtAdapter.POSTGRES,
        }),
        [sqlQueryDimensions],
    );
    const [vizIsOpen, setVizIsOpen] = useState(false);
    const [chartConfig, setChartConfig] = useState<ChartConfig['config']>();
    const [chartType, setChartType] = useState<ChartType>(ChartType.CARTESIAN);
    const onSubmit = useCallback(() => {
        if (sql) {
            mutate(sql);
        }
    }, [mutate, sql]);
    const hotkeys = useMemo(() => {
        const runQueryHotkey = {
            combo: 'ctrl+enter',
            group: 'SQL runner',
            label: 'Run SQL query',
            allowInInput: true,
            onKeyDown: onSubmit,
            global: true,
            preventDefault: true,
            stopPropagation: true,
        };
        return [
            runQueryHotkey,
            {
                ...runQueryHotkey,
                combo: 'cmd+enter',
            },
        ];
    }, [onSubmit]);
    useHotkeys(hotkeys);
    const catalogTree = useProjectCatalogTree(catalogData);

    const handleNodeClick = React.useCallback(
        (node: TreeNodeInfo) => {
            if (node.nodeData) {
                setSql(
                    generateBasicSqlQuery(
                        (node.nodeData as TableBase).sqlTable,
                    ),
                );
            }
        },
        [setSql],
    );

    return (
        <PageWithSidebar>
            <Sidebar title="SQL runner">
                <Title>Warehouse schema</Title>
                <SideBarWrapper>
                    {isCatalogLoading ? (
                        <SideBarLoadingState />
                    ) : (
                        <Tree
                            contents={catalogTree}
                            handleSelect={false}
                            onNodeClick={handleNodeClick}
                        />
                    )}
                </SideBarWrapper>
                <MissingTablesInfo content="Currently we only display tables that are declared in the dbt project.">
                    <SqlCallout intent="none" icon="info-sign">
                        Tables missing?
                    </SqlCallout>
                </MissingTablesInfo>
            </Sidebar>
            <ContentContainer>
                <TrackSection name={SectionName.EXPLORER_TOP_BUTTONS}>
                    <ButtonsWrapper>
                        <RefreshDbtButton />
                        <RunSqlQueryButton
                            onSubmit={onSubmit}
                            isLoading={isLoading}
                        />
                    </ButtonsWrapper>
                </TrackSection>
                <CardDivider />
                <Card style={{ padding: 5, overflowY: 'scroll' }} elevation={1}>
                    <VisualizationProvider
                        initialChartConfig={undefined}
                        chartType={chartType}
                        initialPivotDimensions={undefined}
                        resultsData={resultsData}
                        isLoading={isLoading}
                        onChartConfigChange={setChartConfig}
                        onChartTypeChange={setChartType}
                        onPivotDimensionsChange={() =>
                            console.log('onPivotDimensionsChange')
                        }
                        columnOrder={[]}
                        explore={explore}
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
                                        vizIsOpen
                                            ? 'chevron-down'
                                            : 'chevron-right'
                                    }
                                    minimal
                                    onClick={() =>
                                        setVizIsOpen((value) => !value)
                                    }
                                />
                                <H5 style={{ margin: 0, padding: 0 }}>
                                    Charts
                                </H5>
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
                                    {chartType === ChartType.BIG_NUMBER ? (
                                        <BigNumberConfigPanel />
                                    ) : (
                                        <ChartConfigPanel />
                                    )}
                                    <ChartDownloadMenu />
                                </div>
                            )}
                        </div>
                        <Collapse isOpen={vizIsOpen}>
                            <div
                                style={{ height: '300px' }}
                                className="cohere-block"
                            >
                                <LightdashVisualization />
                            </div>
                        </Collapse>
                    </VisualizationProvider>
                </Card>
                <CardDivider />
                <CollapsableCard title="SQL" isOpenByDefault>
                    <SqlRunnerInput
                        sql={sql}
                        onChange={setSql}
                        projectCatalog={catalogData}
                        isDisabled={isLoading}
                    />
                </CollapsableCard>
                <CardDivider />
                <CollapsableCard title="Results" isOpenByDefault>
                    <SqlRunnerResultsTable
                        onSubmit={onSubmit}
                        sqlQueryMutation={sqlQueryMutation}
                    />
                </CollapsableCard>
            </ContentContainer>
        </PageWithSidebar>
    );
};
export default SqlRunnerPage;
