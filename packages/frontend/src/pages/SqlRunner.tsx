import { Callout, Card, Divider, H3, H5, useHotkeys } from '@blueprintjs/core';
import { TreeNodeInfo } from '@blueprintjs/core/src/components/tree/treeNode';
import { Tooltip2 } from '@blueprintjs/popover2';
import { TableBase } from 'common';
import React, { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import AboutFooter from '../components/AboutFooter';
import { CollapsableCard } from '../components/common/CollapsableCard';
import SideBarLoadingState from '../components/common/SideBarLoadingState';
import { Tree } from '../components/common/Tree';
import { RefreshServerButton } from '../components/RefreshServerButton';
import RunSqlQueryButton from '../components/SqlRunner/RunSqlQueryButton';
import SqlRunnerInput from '../components/SqlRunner/SqlRunnerInput';
import SqlRunnerResultsTable from '../components/SqlRunner/SqlRunnerResultsTable';
import { useProjectCatalog } from '../hooks/useProjectCatalog';
import { useProjectCatalogTree } from '../hooks/useProjectCatalogTree';
import { useSqlQueryMutation } from '../hooks/useSqlQuery';
import { Section } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';
import './SqlRunner.css';

const Wrapper = styled('div')`
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: stretch;
    align-items: flex-start;
`;

const Sidebar = styled(Card)`
    height: calc(100vh - 50px);
    flex-basis: 400px;
    flex-shrink: 0;
    flex-grow: 0;
    margin-right: 10px;
    overflow: hidden;
    position: sticky;
    top: 50px;
`;

const ContentSection = styled('div')`
    padding: 10px 10px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
    min-width: 0;
`;

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
        <Wrapper>
            <Sidebar elevation={1}>
                <Section name={SectionName.SIDEBAR}>
                    <div
                        style={{
                            height: '100%',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <div style={{ flex: 1 }}>
                            <H3 style={{ marginBottom: 20 }}>SQL runner</H3>
                            <Divider />
                            <H5 style={{ marginTop: 20, paddingLeft: 10 }}>
                                Warehouse schema
                            </H5>
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
                        </div>

                        <AboutFooter />
                    </div>
                </Section>
            </Sidebar>
            <ContentSection>
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
            </ContentSection>
        </Wrapper>
    );
};

export default SqlRunnerPage;
