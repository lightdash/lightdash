import { Callout, H5, useHotkeys } from '@blueprintjs/core';
import { TreeNodeInfo } from '@blueprintjs/core/src/components/tree/treeNode';
import { Tooltip2 } from '@blueprintjs/popover2';
import { TableBase } from 'common';
import React, { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import { CollapsableCard } from '../components/common/CollapsableCard';
import Content from '../components/common/Page/Content';
import PageWithSidebar from '../components/common/Page/PageWithSidebar';
import Sidebar from '../components/common/Page/Sidebar';
import SideBarLoadingState from '../components/common/SideBarLoadingState';
import { Tree } from '../components/common/Tree';
import MobileView from '../components/Mobile';
import { RefreshServerButton } from '../components/RefreshServerButton';
import RunSqlQueryButton from '../components/SqlRunner/RunSqlQueryButton';
import SqlRunnerInput from '../components/SqlRunner/SqlRunnerInput';
import SqlRunnerResultsTable from '../components/SqlRunner/SqlRunnerResultsTable';
import useBreakpoint from '../hooks/useBreakpoint';
import { useProjectCatalog } from '../hooks/useProjectCatalog';
import { useProjectCatalogTree } from '../hooks/useProjectCatalogTree';
import { useSqlQueryMutation } from '../hooks/useSqlQuery';
import { TrackSection } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';
import './SqlRunner.css';

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
    const { isOverBreakpoint } = useBreakpoint(768);
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
        <>
            {isOverBreakpoint ? (
                <PageWithSidebar>
                    <Sidebar title="SQL runner">
                        <H5 style={{ paddingLeft: 10 }}>Warehouse schema</H5>
                        <div style={{ overflowY: 'auto' }}>
                            {isCatalogLoading ? (
                                <SideBarLoadingState />
                            ) : (
                                <Tree
                                    contents={catalogTree}
                                    handleSelect={false}
                                    onNodeClick={handleNodeClick}
                                />
                            )}
                        </div>
                        <Tooltip2
                            content="Currently we only display tables that are declared in the dbt project."
                            className="missing-tables-info"
                        >
                            <Callout
                                intent="none"
                                icon="info-sign"
                                style={{ marginTop: 20 }}
                            >
                                Tables missing?
                            </Callout>
                        </Tooltip2>
                    </Sidebar>
                    <Content>
                        <TrackSection name={SectionName.EXPLORER_TOP_BUTTONS}>
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'row',
                                    justifyContent: 'flex-end',
                                    alignItems: 'center',
                                }}
                            >
                                <RunSqlQueryButton
                                    onSubmit={onSubmit}
                                    isLoading={isLoading}
                                />
                                <RefreshServerButton />
                            </div>
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
                    </Content>
                </PageWithSidebar>
            ) : (
                <MobileView />
            )}
        </>
    );
};

export default SqlRunnerPage;
