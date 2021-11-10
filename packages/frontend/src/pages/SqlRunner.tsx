import React, { useState, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { H3, H5, Divider, Callout, useHotkeys } from '@blueprintjs/core';
import { TreeNodeInfo } from '@blueprintjs/core/src/components/tree/treeNode';
import { TableBase } from 'common';
import { Tooltip2 } from '@blueprintjs/popover2';
import { CollapsableCard } from '../components/common/CollapsableCard';
import { useSqlQueryMutation } from '../hooks/useSqlQuery';
import { Section } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';
import { RefreshServerButton } from '../components/RefreshServerButton';
import AboutFooter from '../components/AboutFooter';
import { useProjectCatalog } from '../hooks/useProjectCatalog';
import { Tree } from '../components/common/Tree';
import { useProjectCatalogTree } from '../hooks/useProjectCatalogTree';
import SqlRunnerResultsTable from '../components/SqlRunner/SqlRunnerResultsTable';
import RunSqlQueryButton from '../components/SqlRunner/RunSqlQueryButton';
import SideBarLoadingState from '../components/common/SideBarLoadingState';
import SqlRunnerInput from '../components/SqlRunner/SqlRunnerInput';
import './SqlRunner.css';
import PageBase from '../components/common/Page/PageBase';
import Sidebar from '../components/common/Page/Sidebar';
import Content from '../components/common/Page/Content';

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
        <PageBase>
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
                <Section name={SectionName.EXPLORER_TOP_BUTTONS}>
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
                </Section>
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
        </PageBase>
    );
};

export default SqlRunnerPage;
