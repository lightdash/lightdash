import React, {
    FC,
    useMemo,
    useState,
    useCallback,
    Dispatch,
    SetStateAction,
    useEffect,
} from 'react';
import styled from 'styled-components';
import { Tooltip2 } from '@blueprintjs/popover2';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import {
    Button,
    Card,
    H3,
    Menu,
    MenuDivider,
    MenuItem,
    NonIdealState,
    PopoverPosition,
    Text,
    Divider,
    useHotkeys,
} from '@blueprintjs/core';
import { Ace } from 'ace-builds';
import langTools from 'ace-builds/src-noconflict/ext-language_tools';
import { TreeNodeInfo } from '@blueprintjs/core/src/components/tree/treeNode';
import { friendlyName, TableBase } from 'common';
import AceEditor from 'react-ace';
import { CollapsableCard } from '../components/common/CollapsableCard';
import { useSqlQueryMutation } from '../hooks/useSqlQuery';
import { Section } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';
import { RefreshServerButton } from '../components/RefreshServerButton';
import { BigButton } from '../components/common/BigButton';
import { ResultsTable as Table } from '../components/ResultsTable/ResultsTable';
import AboutFooter from '../components/AboutFooter';
import { useProjectCatalog } from '../hooks/useProjectCatalog';
import { Tree } from '../components/common/Tree';

const Wrapper = styled('div')`
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: stretch;
    align-items: flex-start;
`;

const Sidebar = styled(Card)`
    height: calc(100vh - 50px);
    width: 400px;
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
`;

const CardDivider = styled('div')`
    padding-top: 10px;
`;

const SideBarLoadingState = () => (
    <Menu large style={{ flex: 1 }}>
        {[0, 1, 2, 3, 4].map((idx) => (
            <React.Fragment key={idx}>
                <MenuItem className="bp3-skeleton" text="Hello" />
                <MenuDivider />
            </React.Fragment>
        ))}
    </Menu>
);

const RunQueryButton: FC<{ isLoading: boolean; onSubmit: () => void }> = ({
    onSubmit,
    isLoading,
}) => (
    <BigButton
        intent="primary"
        style={{ width: 150, marginRight: '10px' }}
        onClick={onSubmit}
        loading={isLoading}
    >
        Run query
    </BigButton>
);

const ResultsIdleState: FC<React.ComponentProps<typeof RunQueryButton>> = (
    props,
) => (
    <Section name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <NonIdealState
                description="Click run query to see your results"
                action={<RunQueryButton {...props} />}
            />
        </div>
    </Section>
);

const createCompleter: (fields: Ace.Completion[]) => Ace.Completer = (
    fields,
) => ({
    getCompletions: (editor, session, pos, prefix, callback) => {
        callback(null, fields);
    },
});

export const useProjectCatalogAceEditorCompleter = (
    sqlTables: string[],
): {
    setAceEditor: Dispatch<SetStateAction<Ace.Editor | undefined>>;
} => {
    const [aceEditor, setAceEditor] = useState<Ace.Editor>();

    useEffect(() => {
        if (aceEditor) {
            const fields = sqlTables.map<Ace.Completion>((sqlTable) => {
                const technicalOption: Ace.Completion = {
                    caption: sqlTable,
                    value: sqlTable,
                    meta: 'Table',
                    score: Number.MAX_VALUE,
                };
                return technicalOption;
            });
            langTools.setCompleters([createCompleter(fields)]);
        }
        return () => {
            langTools.setCompleters([]);
        };
    }, [aceEditor, sqlTables]);

    return {
        setAceEditor,
    };
};

const generateBasicSqlQuery = (table: string) =>
    `SELECT * FROM ${table} LIMIT 25`;

const SqlRunnerPage = () => {
    const [copied, setCopied] = useState<boolean>(false);
    const [sql, setSql] = useState<string>('');
    const [columnsOrder, setColumnsOrder] = useState<string[]>([]);
    const { isLoading: isCatalogLoading, data: catalogData } =
        useProjectCatalog();
    const { isIdle, isLoading, data, mutate } = useSqlQueryMutation();
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

    const dataColumns = useMemo(() => {
        if (data && data.rows.length > 0) {
            return Object.keys(data.rows[0]).map((key) => ({
                Header: <span>{friendlyName(key)}</span>,
                accessor: key,
                type: 'dimension',
            }));
        }
        return [];
    }, [data]);

    const [catalogTree, autoCompleteSql] = useMemo<
        [TreeNodeInfo[], string[]]
    >(() => {
        if (catalogData) {
            const sqlTables: string[] = [];
            const tree = Object.entries(catalogData).reduce<TreeNodeInfo[]>(
                (accDatabases, [database, schemas], databaseIndex) => [
                    ...accDatabases,
                    {
                        id: database,
                        isExpanded: databaseIndex === 0,
                        label: friendlyName(database),
                        icon: 'database',
                        childNodes: Object.entries(schemas).reduce<
                            TreeNodeInfo[]
                        >(
                            (accSchemas, [schema, tables], schemaIndex) => [
                                ...accSchemas,
                                {
                                    id: schema,
                                    isExpanded: schemaIndex === 0,
                                    label: friendlyName(schema),
                                    icon: 'diagram-tree',
                                    childNodes: Object.entries(tables).reduce<
                                        TreeNodeInfo[]
                                    >((accTables, [table, nodeData]) => {
                                        sqlTables.push(nodeData.sqlTable);
                                        return [
                                            ...accTables,
                                            {
                                                id: table,
                                                label: friendlyName(table),
                                                icon: 'th',
                                                nodeData,
                                            },
                                        ];
                                    }, []),
                                },
                            ],
                            [],
                        ),
                    },
                ],
                [],
            );
            return [tree, sqlTables];
        }
        return [[], []];
    }, [catalogData]);
    const { setAceEditor } =
        useProjectCatalogAceEditorCompleter(autoCompleteSql);

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
                            <div style={{ height: '100px' }}>
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                    }}
                                >
                                    <H3>Tables</H3>
                                </div>
                                <div style={{ padding: '10px' }}>
                                    <Text>
                                        Select a table to populate the sql input
                                    </Text>
                                </div>
                                <Divider />
                            </div>
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
                        <RunQueryButton
                            onSubmit={onSubmit}
                            isLoading={isLoading}
                        />
                        <RefreshServerButton />
                    </div>
                </Section>
                <CardDivider />
                <CollapsableCard title="SQL" isOpenByDefault>
                    <div
                        style={{
                            padding: 10,
                            position: 'relative',
                        }}
                    >
                        <AceEditor
                            readOnly={isLoading}
                            value={sql}
                            height="300px"
                            width="100%"
                            editorProps={{ $blockScrolling: true }}
                            enableBasicAutocompletion
                            enableLiveAutocompletion
                            onChange={(value: string) => {
                                setSql(value);
                                setCopied(false);
                            }}
                            onLoad={setAceEditor}
                        />
                        <div
                            style={{
                                position: 'absolute',
                                bottom: 0,
                                right: 0,
                            }}
                        >
                            <Tooltip2
                                isOpen={copied}
                                content="Copied to clipboard!"
                                intent="success"
                                position={PopoverPosition.RIGHT}
                            >
                                <CopyToClipboard
                                    text={sql}
                                    onCopy={() => setCopied(true)}
                                >
                                    <Button minimal icon="clipboard" />
                                </CopyToClipboard>
                            </Tooltip2>
                        </div>
                    </div>
                </CollapsableCard>
                <CardDivider />
                <CollapsableCard title="Results" isOpenByDefault>
                    <Table
                        data={data?.rows || []}
                        dataColumns={dataColumns}
                        loading={isLoading}
                        idle={isIdle}
                        dataColumnOrder={columnsOrder}
                        onColumnOrderChange={setColumnsOrder}
                        idleState={
                            <ResultsIdleState
                                onSubmit={onSubmit}
                                isLoading={isLoading}
                            />
                        }
                    />
                </CollapsableCard>
            </ContentSection>
        </Wrapper>
    );
};

export default SqlRunnerPage;
