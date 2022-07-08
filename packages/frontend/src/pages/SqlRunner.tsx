import { Button, Collapse, H5, useHotkeys } from '@blueprintjs/core';
import { TreeNodeInfo } from '@blueprintjs/core/src/components/tree/treeNode';
import { ChartType, TableBase } from '@lightdash/common';
import React, { useCallback, useMemo, useState } from 'react';
import { useMount } from 'react-use';
import styled from 'styled-components';
import BigNumberConfigPanel from '../components/BigNumberConfig';
import ChartConfigPanel from '../components/ChartConfigPanel';
import { ChartDownloadMenu } from '../components/ChartDownload';
import { CollapsableCard } from '../components/common/CollapsableCard';
import PageWithSidebar from '../components/common/Page/PageWithSidebar';
import Sidebar from '../components/common/Page/Sidebar';
import SideBarLoadingState from '../components/common/SideBarLoadingState';
import { Tree } from '../components/common/Tree';
import VisualizationCardOptions from '../components/Explorer/VisualizationCardOptions';
import ForbiddenPanel from '../components/ForbiddenPanel';
import LightdashVisualization from '../components/LightdashVisualization';
import VisualizationProvider from '../components/LightdashVisualization/VisualizationProvider';
import RefreshDbtButton from '../components/RefreshDbtButton';
import RunSqlQueryButton from '../components/SqlRunner/RunSqlQueryButton';
import SqlRunnerInput from '../components/SqlRunner/SqlRunnerInput';
import SqlRunnerResultsTable from '../components/SqlRunner/SqlRunnerResultsTable';
import { useProjectCatalog } from '../hooks/useProjectCatalog';
import { useProjectCatalogTree } from '../hooks/useProjectCatalogTree';
import { useSqlQueryMutation } from '../hooks/useSqlQuery';
import useSqlQueryVisualization from '../hooks/useSqlQueryVisualization';
import {
    useSqlRunnerRoute,
    useSqlRunnerUrlState,
} from '../hooks/useSqlRunnerRoute';
import { useApp } from '../providers/AppProvider';
import { TrackSection } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';
import {
    ButtonsWrapper,
    ContentContainer,
    MissingTablesInfo,
    SideBarWrapper,
    SqlCallout,
    Title,
    VisualizationCard,
    VisualizationCardButtons,
    VisualizationCardContentWrapper,
    VisualizationCardHeader,
    VisualizationCardTitle,
} from './SqlRunner.styles';

const CardDivider = styled('div')`
    padding-top: 10px;
`;

const generateBasicSqlQuery = (table: string) =>
    `SELECT *
     FROM ${table} LIMIT 25`;

const SqlRunnerPage = () => {
    const initialState = useSqlRunnerUrlState();
    const [sql, setSql] = useState<string>(initialState?.sqlRunner?.sql || '');
    const [lastSqlRan, setLastSqlRan] = useState<string>();
    const { isLoading: isCatalogLoading, data: catalogData } =
        useProjectCatalog();
    const sqlQueryMutation = useSqlQueryMutation();
    const { isLoading, mutate } = sqlQueryMutation;
    const {
        initialChartConfig,
        initialPivotDimensions,
        explore,
        chartType,
        resultsData,
        columnOrder,
        createSavedChart,
        sqlQueryDimensions,
        setChartType,
        setChartConfig,
        setPivotFields,
    } = useSqlQueryVisualization({
        initialState: initialState?.createSavedChart,
        sqlQueryMutation,
    });
    const sqlRunnerState = useMemo(
        () => ({
            createSavedChart,
            sqlRunner: lastSqlRan ? { sql: lastSqlRan } : undefined,
        }),
        [createSavedChart, lastSqlRan],
    );
    useSqlRunnerRoute(sqlRunnerState);
    const [vizIsOpen, setVizIsOpen] = useState(
        !!initialState?.createSavedChart,
    );
    const onSubmit = useCallback(() => {
        if (sql) {
            mutate(sql);
            setLastSqlRan(sql);
        }
    }, [mutate, sql]);

    useMount(() => {
        if (sql) {
            mutate(sql);
            setLastSqlRan(sql);
        }
    });

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

    const { user } = useApp();
    if (user.data?.ability?.cannot('view', 'Project')) {
        return <ForbiddenPanel />;
    }
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
                <VisualizationCard elevation={1}>
                    <VisualizationProvider
                        initialChartConfig={initialChartConfig}
                        chartType={chartType}
                        initialPivotDimensions={initialPivotDimensions}
                        resultsData={resultsData}
                        isLoading={isLoading}
                        onChartConfigChange={setChartConfig}
                        onChartTypeChange={setChartType}
                        onPivotDimensionsChange={setPivotFields}
                        columnOrder={columnOrder}
                        explore={explore}
                    >
                        <VisualizationCardHeader>
                            <VisualizationCardTitle>
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
                                <H5>Charts</H5>
                            </VisualizationCardTitle>
                            {vizIsOpen && (
                                <VisualizationCardButtons>
                                    <VisualizationCardOptions />
                                    {chartType === ChartType.BIG_NUMBER ? (
                                        <BigNumberConfigPanel />
                                    ) : (
                                        <ChartConfigPanel />
                                    )}
                                    <ChartDownloadMenu />
                                </VisualizationCardButtons>
                            )}
                        </VisualizationCardHeader>
                        <Collapse isOpen={vizIsOpen}>
                            <VisualizationCardContentWrapper className="cohere-block">
                                <LightdashVisualization />
                            </VisualizationCardContentWrapper>
                        </Collapse>
                    </VisualizationProvider>
                </VisualizationCard>
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
                        resultsData={resultsData}
                        sqlQueryDimensions={sqlQueryDimensions}
                        sqlQueryMutation={sqlQueryMutation}
                    />
                </CollapsableCard>
            </ContentContainer>
        </PageWithSidebar>
    );
};
export default SqlRunnerPage;
