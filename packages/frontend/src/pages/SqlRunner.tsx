import { useHotkeys } from '@blueprintjs/core';
import { TreeNodeInfo } from '@blueprintjs/core/src/components/tree/treeNode';
import { TableBase } from 'common';
import React, { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import { CollapsableCard } from '../components/common/CollapsableCard';
import PageWithSidebar from '../components/common/Page/PageWithSidebar';
import Sidebar from '../components/common/Page/Sidebar';
import SideBarLoadingState from '../components/common/SideBarLoadingState';
import { Tree } from '../components/common/Tree';
import RefreshDbtButton from '../components/RefreshDbtButton';
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
    const { isLoading, mutate } = sqlQueryMutation;
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
